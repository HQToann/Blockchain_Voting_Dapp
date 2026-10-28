import json
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import Client, TestCase, override_settings
from django.utils import timezone
from eth_account import Account
from eth_account.messages import encode_defunct

from election.models import Election, IndexerState, MetadataBlob, Option, VoteRecord, WhitelistEntry
from election import indexer_core as core
from .evm import Chain, requires_evm

PNG = b'\x89PNG\r\n\x1a\n' + b'\x00' * 64
from web3 import Web3  # noqa: E402

# Indexer thật luôn lưu địa chỉ dạng checksum -> dữ liệu test cũng phải như vậy
A1 = Web3.to_checksum_address('0x' + 'a1' * 20)
A2 = Web3.to_checksum_address('0x' + 'b2' * 20)
OWNER = Web3.to_checksum_address('0x' + 'c3' * 20)


def make_election(name='Bau lop', owner=OWNER, addr=None, **kw):
    from web3 import Web3
    addr = Web3.to_checksum_address(addr or '0x' + 'd4' * 20)
    now = timezone.now()
    defaults = dict(contract_addr=addr, owner_address=Web3.to_checksum_address(owner), name=name,
                    start_time=now - timedelta(hours=1), max_choices=1)
    defaults.update(kw)
    e = Election.objects.create(**defaults)
    for i, label in enumerate(['An', 'Binh', 'Chi']):
        Option.objects.create(election=e, option_id=i, label=label)
    return e


def login(client, account=None):
    account = account or Account.create()
    d = client.get('/api/auth/nonce/').json()
    sig = account.sign_message(encode_defunct(text=d['message'])).signature.hex()
    r = client.post('/api/auth/verify/', json.dumps({'address': account.address, 'signature': sig, 'nonce': d['nonce']}),
                    content_type='application/json')
    return account, d, sig, r


class AuthTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_login_with_signature_sets_wallet_session(self):
        c = Client()
        acct, _, _, r = login(c)
        self.assertEqual(r.status_code, 200)
        self.assertEqual(c.get('/api/auth/me/').json()['address'], acct.address)
        c.post('/api/auth/logout/')
        self.assertIsNone(c.get('/api/auth/me/').json()['address'])

    def test_nonce_is_single_use_so_signature_cannot_be_replayed(self):
        c = Client()
        acct, d, sig, r = login(c)
        self.assertEqual(r.status_code, 200)
        attacker = Client()
        r2 = attacker.post('/api/auth/verify/', json.dumps({'address': acct.address, 'signature': sig, 'nonce': d['nonce']}),
                           content_type='application/json')
        self.assertEqual(r2.status_code, 401)
        self.assertIsNone(attacker.get('/api/auth/me/').json()['address'])

    def test_signature_from_another_wallet_is_rejected(self):
        c = Client()
        victim, mallory = Account.create(), Account.create()
        d = c.get('/api/auth/nonce/').json()
        sig = mallory.sign_message(encode_defunct(text=d['message'])).signature.hex()
        r = c.post('/api/auth/verify/', json.dumps({'address': victim.address, 'signature': sig, 'nonce': d['nonce']}),
                   content_type='application/json')
        self.assertEqual(r.status_code, 401)

    def test_unknown_nonce_and_garbage_are_rejected(self):
        c = Client()
        acct = Account.create()
        r = c.post('/api/auth/verify/', json.dumps({'address': acct.address, 'signature': '0x00', 'nonce': 'nope'}),
                   content_type='application/json')
        self.assertEqual(r.status_code, 401)
        self.assertEqual(c.post('/api/auth/verify/', 'not json', content_type='application/json').status_code, 400)

    def test_csrf_is_enforced_on_post(self):
        c = Client(enforce_csrf_checks=True)
        r = c.post('/api/auth/verify/', json.dumps({}), content_type='application/json')
        self.assertEqual(r.status_code, 403)
        # /api/config/ đặt cookie csrftoken để frontend dùng
        c.get('/api/config/')
        self.assertIn('csrftoken', c.cookies)

    @override_settings(TRUSTED_PROXY_COUNT=1)
    def test_rate_limit_cannot_be_bypassed_by_spoofing_xff(self):
        c = Client()
        codes = [c.get('/api/auth/nonce/', HTTP_X_FORWARDED_FOR=f'6.6.6.{i}, 9.9.9.9').status_code for i in range(25)]
        self.assertEqual(codes.count(200), 20)          # giới hạn 20/phút theo IP thật (9.9.9.9)
        self.assertEqual(codes.count(429), 5)
        # IP thật khác vẫn dùng được bình thường
        self.assertEqual(c.get('/api/auth/nonce/', HTTP_X_FORWARDED_FOR='6.6.6.6, 8.8.8.8').status_code, 200)


@override_settings(PINATA_JWT='x')
class UploadTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = Client()

    def _png(self, data=PNG):
        return {'image': SimpleUploadedFile('a.png', data, content_type='image/png')}

    def test_requires_login(self):
        self.assertEqual(self.c.post('/api/ipfs/image/', self._png()).status_code, 401)
        self.assertEqual(self.c.post('/api/ipfs/metadata/', '{}', content_type='application/json').status_code, 401)

    def test_image_validation_and_success(self):
        login(self.c)
        with patch('election.views.pin_file', return_value='QmTestCid') as pin:
            # file giả mạo: đuôi/Content-Type là png nhưng nội dung là HTML/script
            r = self.c.post('/api/ipfs/image/', {'image': SimpleUploadedFile('x.png', b'<script>alert(1)</script>', content_type='image/png')})
            self.assertEqual(r.status_code, 415)
            # SVG không được chấp nhận
            r = self.c.post('/api/ipfs/image/', {'image': SimpleUploadedFile('x.svg', b'<svg xmlns="http://www.w3.org/2000/svg"/>', content_type='image/svg+xml')})
            self.assertEqual(r.status_code, 415)
            pin.assert_not_called()
            r = self.c.post('/api/ipfs/image/', self._png())
            self.assertEqual(r.status_code, 200)
            self.assertEqual(r.json()['cid'], 'QmTestCid')
            self.assertEqual(pin.call_args[0][2], 'image/png')

    @override_settings(MAX_IMAGE_BYTES=1000)
    def test_oversized_image_rejected(self):
        login(self.c)
        with patch('election.views.pin_file') as pin:
            r = self.c.post('/api/ipfs/image/', self._png(PNG + b'0' * 5000))
            self.assertEqual(r.status_code, 413)
            pin.assert_not_called()

    @override_settings(UPLOADS_PER_HOUR=3)
    def test_per_wallet_hourly_quota(self):
        login(self.c)
        with patch('election.views.pin_file', return_value='QmX'):
            codes = [self.c.post('/api/ipfs/image/', self._png()).status_code for _ in range(5)]
        self.assertEqual(codes, [200, 200, 200, 429, 429])

    def test_metadata_is_validated_pinned_and_stored(self):
        acct, *_ = login(self.c)
        good = {'description': 'Mo ta', 'options': [{'label': 'An', 'description': '', 'image': ''}],
                'evil_key': '<script>'}
        with patch('election.views.pin_json', return_value='QmMeta') as pin:
            r = self.c.post('/api/ipfs/metadata/', json.dumps(good), content_type='application/json')
            self.assertEqual(r.status_code, 200)
            self.assertNotIn('evil_key', pin.call_args[0][0])          # khoá lạ bị loại
        blob = MetadataBlob.objects.get(cid='QmMeta')
        self.assertEqual(blob.owner_address, acct.address)
        with patch('election.views.pin_json') as pin:
            for bad in ({'description': 'x' * 3000}, {'options': [{'label': ''}]},
                        {'options': [{'label': 'a', 'image': 'http://evil/x.png'}]}, []):
                r = self.c.post('/api/ipfs/metadata/', json.dumps(bad), content_type='application/json')
                self.assertEqual(r.status_code, 400, bad)
            pin.assert_not_called()

    def test_ipfs_error_details_are_not_leaked(self):
        login(self.c)
        from election.services import IpfsError
        with patch('election.views.pin_file', side_effect=IpfsError('Dịch vụ IPFS từ chối yêu cầu, thử lại sau.')):
            r = self.c.post('/api/ipfs/image/', self._png())
        self.assertEqual(r.status_code, 502)
        self.assertNotIn('Bearer', r.content.decode())


class ElectionApiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = Client()

    def test_list_filters_search_and_hidden(self):
        now = timezone.now()
        make_election('Dang mo', addr='0x' + '01' * 20)
        make_election('Sap toi', addr='0x' + '02' * 20, start_time=now + timedelta(days=1))
        make_election('Het gio', addr='0x' + '03' * 20, end_time=now - timedelta(minutes=1))
        make_election('Chu dong', addr='0x' + '04' * 20, closed_by_owner=True)
        make_election('Cua nguoi khac', owner=A1, addr='0x' + '05' * 20, kind=1)
        make_election('Bi an', addr='0x' + '06' * 20, is_hidden=True)

        def names(qs):
            return sorted(e['name'] for e in self.c.get('/api/elections/' + qs).json()['elections'])
        self.assertEqual(len(names('')), 5)                                  # không có hòm phiếu bị ẩn
        self.assertEqual(names('?status=open'), ['Cua nguoi khac', 'Dang mo'])
        self.assertEqual(names('?status=upcoming'), ['Sap toi'])
        self.assertEqual(names('?status=finished'), ['Chu dong', 'Het gio'])
        self.assertEqual(names('?kind=1'), ['Cua nguoi khac'])
        self.assertEqual(names(f'?owner={A1}'), ['Cua nguoi khac'])
        self.assertEqual(names('?q=sap'), ['Sap toi'])
        self.assertEqual(self.c.get('/api/elections/?owner=bad').status_code, 400)

    def test_pagination_and_voted_filter(self):
        for i in range(5):
            make_election(f'E{i}', addr='0x' + f'{i + 10:02x}' * 20)
        d = self.c.get('/api/elections/?page_size=2&page=3').json()
        self.assertEqual((d['total'], d['pages'], len(d['elections'])), (5, 3, 1))
        e = Election.objects.get(name='E2')
        VoteRecord.objects.create(election=e, voter_address=A1, choices=[0], tx_hash='0x' + '1' * 64, block_number=1)
        got = self.c.get(f'/api/elections/?voted={A1}').json()['elections']
        self.assertEqual([x['name'] for x in got], ['E2'])

    def test_detail_percentages_and_errors(self):
        e = make_election(total_voters=4, max_choices=2, description='Mo ta')
        Option.objects.filter(election=e, option_id=0).update(vote_count=3, image_cid='QmImg')
        d = self.c.get(f'/api/elections/{e.contract_addr}/').json()
        self.assertEqual(d['max_choices'], 2)
        self.assertEqual(d['options'][0]['percent'], 75.0)
        self.assertTrue(d['options'][0]['image_url'].endswith('/QmImg'))
        self.assertEqual(d['status'], 'open')
        # địa chỉ viết thường vẫn tìm được
        self.assertEqual(self.c.get(f'/api/elections/{e.contract_addr.lower()}/').status_code, 200)
        self.assertEqual(self.c.get('/api/elections/0x' + '99' * 20 + '/').status_code, 404)
        self.assertEqual(self.c.get('/api/elections/not-an-address/').status_code, 404)  # URL không khớp pattern
        Election.objects.filter(pk=e.pk).update(is_hidden=True)
        self.assertEqual(self.c.get(f'/api/elections/{e.contract_addr}/').status_code, 410)

    def test_voters_and_whitelist_endpoints(self):
        e = make_election(is_private=True)
        VoteRecord.objects.create(election=e, voter_address=A1, choices=[0, 2], tx_hash='0x' + '2' * 64, block_number=5)
        WhitelistEntry.objects.create(election=e, voter_address=A1)
        WhitelistEntry.objects.create(election=e, voter_address=A2)
        v = self.c.get(f'/api/elections/{e.contract_addr}/voters/').json()
        self.assertEqual(v['votes'][0]['choice_labels'], ['An', 'Chi'])
        mine = self.c.get(f'/api/elections/{e.contract_addr}/voters/', {'voter': A1.lower()}).json()
        self.assertEqual([x['voter'] for x in mine['votes']], [A1])
        none = self.c.get(f'/api/elections/{e.contract_addr}/voters/', {'voter': A2}).json()
        self.assertEqual(none['total'], 0)
        self.assertEqual(self.c.get(f'/api/elections/{e.contract_addr}/voters/', {'voter': 'x'}).status_code, 400)
        w = self.c.get(f'/api/elections/{e.contract_addr}/whitelist/').json()
        self.assertEqual({x['address']: x['voted'] for x in w['entries']}, {A1: True, A2: False})
        pub = make_election('Cong khai', addr='0x' + '07' * 20)
        self.assertFalse(self.c.get(f'/api/elections/{pub.contract_addr}/whitelist/').json()['is_private'])

    def test_indexer_lagging_flag_follows_heartbeat(self):
        make_election()
        self.assertTrue(self.c.get('/api/elections/').json()['indexer']['lagging'])     # chưa có watcher
        core.heartbeat()
        self.assertFalse(self.c.get('/api/elections/').json()['indexer']['lagging'])
        IndexerState.objects.update(updated_at=timezone.now() - timedelta(minutes=10))
        self.assertTrue(self.c.get('/api/elections/').json()['indexer']['lagging'])

    def test_config_has_no_secrets(self):
        d = self.c.get('/api/config/').json()
        self.assertEqual(d['chain_id'], 11155111)
        raw = json.dumps(d).lower()
        for secret in ('private', 'jwt', 'secret', 'bearer'):
            self.assertNotIn(secret, raw)


class VerifyTxTests(TestCase):
    def setUp(self):
        cache.clear()
        self.c = Client()

    def test_confirmed_works_with_or_without_0x(self):
        e = make_election()
        h = 'ab' * 32
        VoteRecord.objects.create(election=e, voter_address=A1, choices=[1], tx_hash='0x' + h, block_number=7)
        for q in ('0x' + h, h, '0x' + h.upper()):
            d = self.c.get('/api/verify/', {'tx': q}).json()
            self.assertEqual(d['status'], 'confirmed', q)
            self.assertEqual(d['choice_labels'], ['Binh'])

    def test_invalid_hash_and_no_rpc(self):
        self.assertEqual(self.c.get('/api/verify/', {'tx': 'xyz'}).status_code, 400)
        with patch('election.views.get_http_w3', return_value=None):
            self.assertEqual(self.c.get('/api/verify/', {'tx': '0x' + '1' * 64}).status_code, 503)

    @requires_evm
    def test_on_chain_but_not_indexed_yet_then_not_vote_and_failed(self):
        chain = Chain()
        alice, bob = chain.accounts[:2]
        e = chain.create(alice)
        make_election(addr=e.address)
        ok = chain.send(e.functions.vote([0]), bob)
        plain = chain.w3.eth.send_transaction({'from': bob, 'to': alice, 'value': 1})
        with patch('election.views.get_http_w3', return_value=chain.w3):
            d = self.c.get('/api/verify/', {'tx': ok.transactionHash.hex()}).json()
            self.assertEqual(d['status'], 'pending_index')
            d = self.c.get('/api/verify/', {'tx': plain.hex()}).json()
            self.assertEqual(d['status'], 'not_vote')
            d = self.c.get('/api/verify/', {'tx': '0x' + '5' * 64}).json()
            self.assertEqual(d['status'], 'not_found')


class WebSocketTests(TestCase):
    def test_room_validation_origin_and_typed_messages(self):
        import asyncio
        from channels.testing import WebsocketCommunicator
        from core.asgi import application
        from election.realtime import publish

        addr = '0x' + 'ab' * 20
        origin = [(b'origin', b'http://localhost')]

        async def run():
            ok = WebsocketCommunicator(application, f'/ws/election/{addr}/', headers=origin)
            self.assertTrue((await ok.connect())[0])
            allroom = WebsocketCommunicator(application, '/ws/election/all/', headers=origin)
            self.assertTrue((await allroom.connect())[0])

            await publish([{'groups': [addr.lower(), 'all'],
                            'payload': {'type': 'vote', 'election': addr, 'total_voters': 3}}])
            self.assertEqual(json.loads(await ok.receive_from(timeout=2))['type'], 'vote')
            self.assertEqual(json.loads(await allroom.receive_from(timeout=2))['total_voters'], 3)
            await ok.disconnect(); await allroom.disconnect()

            # phòng không hợp lệ: không có route -> không kết nối được
            with self.assertRaises(Exception):
                bad = WebsocketCommunicator(application, '/ws/election/not-valid/', headers=origin)
                await bad.connect()
            # Origin lạ bị từ chối
            evil = WebsocketCommunicator(application, f'/ws/election/{addr}/', headers=[(b'origin', b'http://evil.example')])
            self.assertFalse((await evil.connect())[0])

        asyncio.run(run())
