from django.test import TestCase, override_settings

from election import indexer_core as core
from election.models import Election, MetadataBlob, Option, VoteRecord, WhitelistEntry
from .evm import Chain, requires_evm


def feed(chain, logs=None):
    """Đưa toàn bộ log của chain vào indexer (như watcher làm), trả về các tin realtime."""
    out = []
    for log in (logs if logs is not None else chain.logs()):
        out.extend(core.process_log(chain.w3, log, chain.factory_address))
    return out


@requires_evm
class IndexerCoreTests(TestCase):
    def setUp(self):
        self.chain = Chain()
        self.alice, self.bob, self.carol, self.dave, self.eve = self.chain.accounts[:5]

    def test_election_created_sets_owner_and_options(self):
        e = self.chain.create(self.alice, name='Chu tich CLB', kind=0, maxChoices=2, options=['An', 'Binh', 'Chi'])
        msgs = feed(self.chain)
        row = Election.objects.get()
        self.assertEqual(row.contract_addr, e.address)
        self.assertEqual(row.owner_address, self.alice)
        self.assertEqual(row.max_choices, 2)
        # eth-tester có đồng hồ riêng, nên so trạng thái theo giờ của chain chứ không phải giờ máy
        from datetime import datetime, timezone as tz
        chain_now = datetime.fromtimestamp(self.chain.now() + 1, tz=tz.utc)
        self.assertEqual(row.get_status(now=chain_now), 'open')
        self.assertEqual([o.label for o in row.options.all()], ['An', 'Binh', 'Chi'])
        self.assertEqual(msgs[0]['payload']['type'], 'created')

    def test_metadata_from_db_is_applied_by_matching_labels(self):
        cid = 'bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi'
        MetadataBlob.objects.create(cid=cid, owner_address=self.alice, content={
            'version': 1, 'description': 'Mo ta chi tiet',
            'options': [{'label': 'An', 'description': 'Lop truong', 'image': cid},
                        {'label': 'SAI-NHAN', 'description': 'khong khop', 'image': cid},
                        {'label': 'Chi', 'description': '', 'image': ''}]})
        self.chain.create(self.alice, metadataURI=cid)
        feed(self.chain)
        row = Election.objects.get()
        self.assertTrue(row.metadata_loaded)
        self.assertEqual(row.description, 'Mo ta chi tiet')
        opts = {o.label: o for o in row.options.all()}
        self.assertEqual(opts['An'].description, 'Lop truong')
        self.assertEqual(opts['An'].image_cid, cid)
        self.assertEqual(opts['Binh'].image_cid, '')   # nhãn không khớp -> bỏ qua, không gán nhầm

    def test_multi_choice_votes_are_counted_and_idempotent(self):
        e = self.chain.create(self.alice, maxChoices=3, options=['A', 'B', 'C', 'D'])
        self.chain.send(e.functions.vote([0]), self.bob)
        self.chain.send(e.functions.vote([0, 2]), self.carol)
        self.chain.send(e.functions.vote([1, 2, 3]), self.dave)
        feed(self.chain)
        feed(self.chain)   # xử lý lại toàn bộ lần 2 -> không được đếm đôi
        row = Election.objects.get()
        self.assertEqual(row.total_voters, 3)
        self.assertEqual(list(row.options.values_list('vote_count', flat=True)), [2, 1, 2, 1])
        self.assertEqual(VoteRecord.objects.count(), 3)
        v = VoteRecord.objects.get(voter_address=self.carol)
        self.assertEqual(v.choices, [0, 2])
        self.assertTrue(v.tx_hash.startswith('0x') and len(v.tx_hash) == 66)

    def test_foreign_contract_events_are_ignored(self):
        """Contract lạ phát event giống hệt (kể cả cả Factory giả) không được ảnh hưởng dữ liệu."""
        mine = self.chain.create(self.alice)
        feed(self.chain)
        # Kẻ tấn công deploy Factory giả và tạo hòm phiếu riêng
        evil = Chain(deployer=7)   # ví khác deploy -> địa chỉ khác (hai chain test độc lập cùng nonce sẽ trùng địa chỉ)
        self.assertNotEqual(evil.factory_address, self.chain.factory_address)
        fake = evil.create(self.eve, name='Gia mao')
        evil.send(fake.functions.vote([1]), self.bob)
        self.assertNotEqual(fake.address, mine.address)
        for log in evil.logs():       # đưa log của chain giả vào indexer của ta
            core.process_log(self.chain.w3, log, self.chain.factory_address)
        self.assertEqual(Election.objects.count(), 1)
        self.assertEqual(VoteRecord.objects.count(), 0)
        self.assertEqual(Election.objects.get().contract_addr, mine.address)

    def test_whitelist_schedule_and_close_events(self):
        now = self.chain.now()
        e = self.chain.create(self.alice, isPrivate=True, startTime=now + 1000, endTime=now + 9000)
        self.chain.send(e.functions.addToWhitelist([self.bob, self.carol]), self.alice)
        self.chain.send(e.functions.removeFromWhitelist([self.carol]), self.alice)
        self.chain.send(e.functions.reschedule(now + 2000, now + 8000), self.alice)
        feed(self.chain)
        row = Election.objects.get()
        self.assertEqual(row.status, 'upcoming')
        self.assertEqual(list(WhitelistEntry.objects.values_list('voter_address', flat=True)), [self.bob])
        self.assertEqual(int(row.start_time.timestamp()), now + 2000)
        self.assertEqual(int(row.end_time.timestamp()), now + 8000)
        self.chain.send(e.functions.closeEarly(), self.alice)
        feed(self.chain)
        row.refresh_from_db()
        self.assertEqual(row.status, 'closed')

    def test_different_owners_get_independent_elections(self):
        a = self.chain.create(self.alice, name='Cua Alice')
        b = self.chain.create(self.bob, name='Cua Bob', kind=1, options=['Dong y', 'Khong'])
        feed(self.chain)
        self.assertEqual(Election.objects.get(contract_addr=a.address).owner_address, self.alice)
        eb = Election.objects.get(contract_addr=b.address)
        self.assertEqual((eb.owner_address, eb.kind), (self.bob, 1))

    @override_settings(GETLOGS_BLOCK_RANGE=3)
    def test_catch_up_from_scratch_rebuilds_same_state(self):
        e1 = self.chain.create(self.alice, maxChoices=2, isPrivate=True)
        self.chain.send(e1.functions.addToWhitelist([self.bob, self.carol]), self.alice)
        self.chain.send(e1.functions.vote([0, 1]), self.bob)
        e2 = self.chain.create(self.dave, name='Thu hai')
        self.chain.send(e2.functions.vote([2]), self.eve)
        self.chain.send(e1.functions.vote([1]), self.carol)
        head = self.chain.w3.eth.block_number
        # DB trống + quét từ block 0, chunk=3 (có hòm phiếu mới tạo giữa chunk)
        core.scan_logs(self.chain.w3, 0, head, self.chain.factory_address)
        self.assertEqual(Election.objects.count(), 2)
        r1 = Election.objects.get(contract_addr=e1.address)
        self.assertEqual(r1.total_voters, 2)
        self.assertEqual(list(r1.options.values_list('vote_count', flat=True)), [1, 2, 0])
        self.assertEqual(r1.whitelist.count(), 2)
        self.assertEqual(Election.objects.get(contract_addr=e2.address).total_voters, 1)

    def test_reconcile_heals_missed_events_and_phantoms(self):
        e = self.chain.create(self.alice, options=['A', 'B', 'C'])
        for voter, ch in ((self.bob, [0]), (self.carol, [1]), (self.dave, [1])):
            self.chain.send(e.functions.vote(ch), voter)
        feed(self.chain)
        row = Election.objects.get()
        w3 = self.chain.w3

        # (1) Mất 2 phiếu (giả lập watcher rớt mạng) -> đối soát phải quét lại và bù đủ
        VoteRecord.objects.filter(voter_address__in=[self.carol, self.dave]).delete()
        Election.objects.filter(pk=row.pk).update(total_voters=1)
        Option.objects.filter(election=row, option_id=1).update(vote_count=0)
        fixed = core.reconcile_election(w3, row)
        self.assertTrue(fixed.get('rescanned'))
        row.refresh_from_db()
        self.assertEqual(row.total_voters, 3)
        self.assertEqual(row.options.get(option_id=1).vote_count, 2)

        # (2) Phiếu "ma" không có trên chain (ví dụ sau reorg) -> dựng lại từ chain
        VoteRecord.objects.create(election=row, voter_address=self.eve, choices=[2], tx_hash='0x' + '11' * 32, block_number=1)
        fixed = core.reconcile_election(w3, row)
        self.assertTrue(fixed.get('rebuilt'))
        self.assertEqual(VoteRecord.objects.filter(election=row).count(), 3)
        self.assertFalse(VoteRecord.objects.filter(voter_address=self.eve).exists())

        # (3) Lịch / cờ đóng sớm bị lệch -> ghi đè theo chain
        Election.objects.filter(pk=row.pk).update(closed_by_owner=True)
        fixed = core.reconcile_election(w3, row)
        self.assertTrue(fixed.get('schedule'))
        row.refresh_from_db()
        self.assertFalse(row.closed_by_owner)

    def test_heartbeat_updates_indexer_state(self):
        core.set_last_block(10)
        core.set_last_block(5)    # không được lùi
        self.assertEqual(core.get_last_block(), 10)
