"""
Lõi Indexer — biến event on-chain thành dữ liệu trong DB.

Tất cả hàm ở đây là đồng bộ và nhận `w3` làm tham số, nên:
  - Chain Watcher (async) gọi qua sync_to_async,
  - Test chạy được trên EVM thật (eth-tester) mà không cần mạng.

Hàm xử lý event trả về danh sách "tin cần phát realtime" (dict) — lõi Không tự phát WebSocket,
nhờ vậy không phụ thuộc event loop và dễ kiểm thử.

An toàn:
  - Chỉ nhận ElectionCreated từ đúng địa chỉ Factory.
  - Chỉ nhận event của hòm phiếu từ contract đã được Factory đăng ký (có trong DB).
  - Contract lạ phát event giả (VoteCast...) bị bỏ qua hoàn toàn.
  - Mọi bước đều idempotent: xử lý lại cùng một log không làm sai dữ liệu.
"""

import logging

from datetime import datetime, timezone as dt_timezone
from functools import lru_cache

from django.conf import settings
from django.db import IntegrityError, transaction
from django.db.models import F
from django.utils import timezone

from eth_utils.abi import event_abi_to_log_topic
from web3._utils.events import get_event_data

from .metadata import load_metadata
from .models import Election, IndexerState, Option, SystemLog, VoteRecord, WhitelistEntry
from .utils import get_factory_address, load_abi, norm_tx_hash, to_checksum

logger = logging.getLogger('election.indexer')

# ABI / topic
# Sử dụng bộ nhớ đệm (lru_cache) để chỉ đọc file một lần duy nhất, các lần sau lấy từ RAM
@lru_cache(maxsize=1)
def abis():
    # Tải nội dung file json của 2 contract
    return load_abi('Election'), load_abi('Factory')

# Tạo từ điển ánh xạ (mapping) giữa mã Topic0 (định dang sự kiện) và thông tin sự kiện
@lru_cache(maxsize=1)
def topic_map():
    """topic0 (0x…) -> (nguồn 'factory'|'election', tên event, ABI item)"""
    election_abi, factory_abi = abis()
    m = {}

    # Quét toàn bộ ABI của 2 contract và tìm phần tử 'event'
    for source, abi in (('factory', factory_abi), ('election', election_abi)):
        for item in abi:
              if item.get('type') == 'event':
                  # Băm event thành topic0 (keccak256) và lưu vào dict m
                  m['0x' + event_abi_to_log_topic(item).hex()] = (source, item['name'], item)
    return m

# Lấy danh sách tất cả các topic0 để theo dõi trên Blockchain
def watched_topics():
    # Trả về mảng các key (topic0) từ dict topic_map
    return list(topic_map().keys())

# Chuẩn hoá các kiểu dữ liệu HexBytes, bytes, str về 1 chuẩn chung
def _hex(value):
    """HexBytes / bytes / str -> chuỗi 0x… chữ thường (không phụ thuộc phiên bản hexbytes)."""
    # Xử lý kiểu dữ liệu bytes nguyên thuỷ
    if isinstance(value, (bytes, bytearray)):
        return '0x' + bytes(value).hex()

    # Xử lý kiểu dữ liệu HexBytes của thư viện Web3
    if hasattr(value, 'hex'):
        h = value.hex()
        return h.lower() if h.startswith('0x') else '0x' + h.lower()
    
    # Xử lý kiểu chuỗi thông thường (str)
    v = str(value).lower()
    return v if v.startswith('0x') else '0x' + v

# Chuyển đổi thời gian Unix (từ Smart Contract) sang định dạng Datetime chuẩn UTC cho Database
def _from_ts(seconds):
    return datetime.fromtimestamp(int(seconds), tz=dt_timezone.utc)

# Ghi nhận lịch sử hoạt động (Log) vào Database một cách an toàn
def _log_sys(level, msg):
    try:
        # Cắt chuỗi thông báo chỉ lấy 1000 ký tự đầu tiên để tránh lỗi tràn bộ nhớ cột DB
        SystemLog.objects.create(level=level, module='INDEXER', message=msg[:1000])
    except Exception:
        # Nếu lỗi (ví dụ: mất kết nối DB), chỉ in ra console chứ không làm sập phần mềm
        logger.exception('Không ghi được SystemLog')

# Khởi tạo đối tượng giao tiếp với contract hòm phiếu (Election)
def election_contract(w3, address):
    # Luôn bọc qua hàm to_checksum để đảm bảo an toàn định dạng địa chỉ
    return w3.eth.contract(address=to_checksum(address), abi=abis()[0])

# Khởi tạo đối tượng giao tiếp với contract quản lý (Factory)
def factory_contract(w3, address):
    return w3.eth.contract(address=to_checksum(address), abi=abis()[1])

# Xử lý từng event
# Đóng gói dữ liệu phát qua WebSocket cho tất cả các kênh (trang chủ)
def _msg_all(payload):
    return {'groups': ['all'], 'payload': payload}

# Đóng gói dữ liệu phát qua WebSocket cho riêng 1 hòm phiếu và trang chủ
def _msg_election(election, payload):
    return {'groups': [election.contract_addr.lower(), 'all'],
            'payload': {'election': election.contract_addr, **payload}}

# Xử lý sự kiện tạo hòm phiếu
def _on_election_created(w3, evt, log):
    a = evt['args']
    addr = to_checksum(a['election'])

    # Bỏ qua nếu hòm phiếu đã tồn tại trong DB (tránh lỗi trùng lặp khi quét lại)
    if Election.objects.filter(contract_addr=addr).exists():
        return []

    labels = election_contract(w3, addr).functions.getOptions().call()
    uri = a['metadataURI'] or ''
    meta = load_metadata(uri) if uri else None
    end = int(a['endTime'])

    try:
        # Transaction atomic: Đảm bảo lưu trọn vẹn dữ liệu, nếu lỗi sẽ hủy toàn bộ (rollback)
        with transaction.atomic():
            election = Election.objects.create(
                contract_addr=addr,
                owner_address=to_checksum(a['owner']),
                name=a['name'],
                kind=int(a['kind']),
                is_private=bool(a['isPrivate']),
                max_choices=int(a['maxChoices']),
                start_time=_from_ts(a['startTime']),
                end_time=_from_ts(end) if end else None,
                metadata_uri=uri,
                metadata_loaded=(not uri) or meta is not None,
                description=meta['description'] if meta else '',
                created_block=int(log['blockNumber']),
                created_tx_hash=norm_tx_hash(_hex(log['transactionHash'])) or '',
            )
            _create_options(election, labels, meta)
    except IntegrityError:
        return []  # Bị chặn nếu có tiến trình (worker) khác vừa tạo xong

    _log_sys('SUCCESS', f'Hòm phiếu mới "{election.name}" tại {addr}')
    return [_msg_all({'type': 'created', 'election': addr})]

# Tạo danh sách các lựa chọn (Options) cho hòm phiếu
def _create_options(election, labels, meta):
    meta_opts = meta['options'] if meta else []
    rows = []
    for i, label in enumerate(labels):
        m = meta_opts[i] if i < len(meta_opts) and meta_opts[i]['label'] == label else None
        rows.append(Option(
            election=election, option_id=i, label=label,
            description=m['description'] if m else '',
            image_cid=m['image'] if m else '',
        ))
    Option.objects.bulk_create(rows) # Lưu toàn bộ lựa chọn vào DB bằng 1 câu lệnh duy nhất

# Xử lý sự kiện Bỏ phiếu (VoteCast)
def _on_vote(election, evt, log):
    a = evt['args']
    voter = to_checksum(a['voter'])
    choices = [int(c) for c in a['choices']]
    try:
        with transaction.atomic():
            VoteRecord.objects.create(
                election=election, voter_address=voter, choices=choices,
                tx_hash=norm_tx_hash(_hex(log['transactionHash'])) or '',
                block_number=int(log['blockNumber']),
            )
            # Dùng F() expression để cộng dồn trực tiếp trong DB, tránh lỗi khi nhiều người vote cùng mili-giây
            Option.objects.filter(election=election, option_id__in=choices).update(vote_count=F('vote_count') + 1)
            Election.objects.filter(pk=election.pk).update(total_voters=F('total_voters') + 1)
    except IntegrityError:
        return []  # Bỏ qua nếu phiếu này đã được ghi nhận trước đó
    election.refresh_from_db(fields=['total_voters'])
    return [_msg_election(election, {'type': 'vote', 'voter': voter, 'total_voters': election.total_voters})]

# Xử lý sự kiện Thêm cử tri vào danh sách trắng
def _on_whitelisted(election, evt, log):
    voter = to_checksum(evt['args']['voter'])
    _, created = WhitelistEntry.objects.get_or_create(
        election=election, voter_address=voter,
        defaults={'tx_hash': norm_tx_hash(_hex(log['transactionHash'])) or ''},
    )
    return [_msg_election(election, {'type': 'whitelist'})] if created else []

# Xử lý sự kiện Gỡ cử tri khỏi danh sách trắng
def _on_removed(election, evt, log):
    voter = to_checksum(evt['args']['voter'])
    deleted, _ = WhitelistEntry.objects.filter(election=election, voter_address=voter).delete()
    return [_msg_election(election, {'type': 'whitelist'})] if deleted else []

# Xử lý sự kiện Chủ hòm phiếu thay đổi thời gian
def _on_schedule(election, evt, log):
    a = evt['args']
    end = int(a['endTime'])
    Election.objects.filter(pk=election.pk).update(
        start_time=_from_ts(a['startTime']), end_time=_from_ts(end) if end else None)
    return [_msg_election(election, {'type': 'state'})]

# Xử lý sự kiện Chủ hòm phiếu đóng hòm phiếu sớm
def _on_closed(election, evt, log):
    Election.objects.filter(pk=election.pk).update(closed_by_owner=True)
    return [_msg_election(election, {'type': 'state'})]

# Bộ định tuyến: Ánh xạ tên sự kiện tới đúng hàm xử lý
_ELECTION_HANDLERS = {
    'VoteCast': _on_vote,
    'VoterWhitelisted': _on_whitelisted,
    'VoterRemoved': _on_removed,
    'ScheduleChanged': _on_schedule,
    'ElectionClosed': _on_closed,
}

# Phân tích log thô từ Blockchain và điều phối
def process_log(w3, log, factory_address=None):
    """Xử lý 1 log thô. Trả về danh sách tin cần phát realtime."""
    topics = log.get('topics') or []
    if not topics:
        return []
    
    # Tra cứu Topic0 xem đây là sự kiện gì
    entry = topic_map().get(_hex(topics[0]))
    if entry is None:
        return []
    source, name, abi_item = entry
    address = to_checksum(log['address'])

    # Nếu là sự kiện tạo hòm phiếu, phải kiểm tra xem có đúng Factory của mình phát ra không (Chống giả mạo)
    if source == 'factory':
        factory_address = factory_address or get_factory_address()
        if address != factory_address:
            return []  # Bỏ qua: ElectionCreated giả từ contract lạ
        evt = get_event_data(w3.codec, abi_item, log)
        return _on_election_created(w3, evt, log)

    # Nếu là các sự kiện khác (vote, whitelist...), kiểm tra xem hòm phiếu này có tồn tại trong hệ thống không
    election = Election.objects.filter(contract_addr=address).first()
    if election is None:
        return []  # Bỏ qua: Sự kiện rác từ hòm phiếu không do Factory của ta tạo
    
    # Bóc tách dữ liệu và chuyển đến hàm xử lý tương ứng
    evt = get_event_data(w3.codec, abi_item, log)
    return _ELECTION_HANDLERS[name](election, evt, log)

# Quét lịch sử (catch-up / rescan)
# Sắp xếp các log theo đúng thứ tự thời gian (theo khối và theo vị trí log trong khối)
def _sorted(logs):
    return sorted(logs, key=lambda l: (int(l['blockNumber']), int(l['logIndex'])))

import time

# Gọi RPC để lấy log, tích hợp cơ chế tự động chờ (Exponential Backoff) nếu bị chặn (lỗi 429)
def _fetch_logs_with_retry(w3, params, max_retries=5):
    for attempt in range(max_retries):
        try:
            return w3.eth.get_logs(params)
        except Exception as e:
            if '429' in str(e) and attempt < max_retries - 1:
                logger.warning(f"Rate limited (429) bởi RPC, chờ {2**attempt}s thử lại...")
                time.sleep(2 ** attempt) # Ngủ 1s, 2s, 4s... rồi thử lại
            else:
                raise

# Quét khối Blockchain để tìm các sự kiện bị lỡ (Catch-up)
def scan_logs(w3, from_block, to_block, factory_address=None, addresses=None, on_batch=None):
    """Quét [from_block, to_block] theo từng đoạn nhỏ (giới hạn của RPC miễn phí) và xử lý log."""
    factory_address = factory_address or get_factory_address()
    step = max(1, settings.GETLOGS_BLOCK_RANGE)
    topics = [watched_topics()]
    out = []
    start = from_block

    while start <= to_block:
        end = min(start + step - 1, to_block)
        
        # Nếu không chỉ định địa chỉ cụ thể, quét toàn bộ Factory và các hòm phiếu hiện có
        if addresses is None:
            addrs = [factory_address] + list(Election.objects.values_list('contract_addr', flat=True))
        else:
            addrs = list(addresses)
        known = set(a.lower() for a in addrs)

        # Cắt nhỏ danh sách địa chỉ (chunk) thành từng nhóm 3 để RPC không bị quá tải
        for i in range(0, len(addrs), 3):
            chunk = addrs[i:i + 3]
            logs = _fetch_logs_with_retry(w3, {'fromBlock': start, 'toBlock': end, 'address': chunk, 'topics': topics})
            for log in _sorted(logs):
                out.extend(process_log(w3, log, factory_address))

        # Xử lý trường hợp một hòm phiếu vừa được tạo mới ngay trong loạt block đang quét
        # và có người vote ngay vào nó (nếu không quét lại sẽ bị lọt mất phiếu)
        if addresses is None:
            new_addrs = [a for a in Election.objects.values_list('contract_addr', flat=True) if a.lower() not in known]
            if new_addrs:
                for i in range(0, len(new_addrs), 3):
                    chunk = new_addrs[i:i + 3]
                    logs2 = _fetch_logs_with_retry(w3, {'fromBlock': start, 'toBlock': end, 'address': chunk, 'topics': topics})
                    for log in _sorted(logs2):
                        out.extend(process_log(w3, log, factory_address))

        if on_batch:
            on_batch(end)
        start = end + 1
        time.sleep(settings.SCAN_SLEEP)  # Giãn nhịp nghỉ giữa các lần quét để tránh bị chặn 429
    return out

# Đối soát với chain (tự chữa lành)
def reconcile_election(w3, election, block=None):
    """So DB với trạng thái thật trên chain tại một block cố định và tự sửa nếu lệch.

    - lịch / cờ đóng sớm: ghi đè theo chain (tuyệt đối, không phụ thuộc thứ tự event)
    - số cử tri: nếu DB thiếu phiếu -> quét lại event của hòm phiếu này;
                 nếu DB thừa phiếu (ví dụ reorg) -> dựng lại từ đầu
    - metadata chưa tải được -> thử lại
    Trả về dict mô tả những gì đã sửa.
    """
    election.refresh_from_db()   # Cập nhật đối tượng từ DB để lấy dữ liệu mới nhất
    block = block if block is not None else w3.eth.block_number
    c = election_contract(w3, election.contract_addr)

    # Hàm gọi RPC an toàn, tự động thử lại (retry) tối đa 3 lần nếu bị lỗi mạng hoặc quá tải (429)
    def _safe_call(fn, *a, **kw):
        for attempt in range(3):
            try:
                return fn(*a, **kw)
            except Exception as e:
                if '429' in str(e) or 'Timeout' in str(e):
                    if attempt < 2:
                        time.sleep(2 ** attempt)
                        continue
                raise

    # Truy vấn trạng thái thực tế của hòm phiếu từ Smart Contract
    start = _safe_call(c.functions.startTime().call, block_identifier=block)
    end = _safe_call(c.functions.endTime().call, block_identifier=block)
    closed = _safe_call(c.functions.closedByOwner().call, block_identifier=block)
    chain_total = _safe_call(c.functions.totalVoters().call, block_identifier=block)

    time.sleep(0.1)  # Giãn nhẹ nhịp gọi RPC để tránh sập Node

    fixed = {}

    # 1. Tự sửa lỗi lịch trình (Thời gian bắt đầu/kết thúc, trạng thái đóng sớm)
    new_start, new_end = _from_ts(start), (_from_ts(end) if end else None)
    if election.start_time != new_start or election.end_time != new_end or election.closed_by_owner != closed:
        Election.objects.filter(pk=election.pk).update(
            start_time=new_start, end_time=new_end, closed_by_owner=closed)
        fixed['schedule'] = True

    # 2. Tự sửa lỗi số lượng phiếu bầu (Lệch dữ liệu)
    db_total = VoteRecord.objects.filter(election=election, block_number__lte=block).count()
    if db_total < chain_total:
        # DB thiếu phiếu (do lỡ log) -> Quét bổ sung sự kiện
        scan_logs(w3, max(election.created_block, 0), block, addresses=[election.contract_addr])
        fixed['rescanned'] = True
    elif db_total > chain_total:
        # DB thừa phiếu (do Blockchain bị reorg cấu trúc lại khối) -> Dựng lại toàn bộ
        rebuild_election(w3, election, block)
        fixed['rebuilt'] = True

    # Kiểm tra lại lần cuối sau khi đã sửa
    after = VoteRecord.objects.filter(election=election, block_number__lte=block).count()
    if after != chain_total:
        _log_sys('WARNING', f'Đối soát {election.contract_addr}: chain={chain_total} DB={after} (chưa khớp)')
        fixed['mismatch'] = (chain_total, after)

    # 3. Tự sửa lỗi thiếu thông tin IPFS (do mạng IPFS chậm lúc tạo hòm phiếu)
    if not election.metadata_loaded:
        meta = load_metadata(election.metadata_uri)
        if meta:
            _apply_metadata(election, meta)
            fixed['metadata'] = True

    Election.objects.filter(pk=election.pk).update(synced_at=timezone.now())
    return fixed

# Cập nhật thông tin chi tiết (tiêu đề, ảnh...) từ IPFS vào Database
def _apply_metadata(election, meta):
    with transaction.atomic(): # Giao dịch nguyên tử: lỗi thì hủy bỏ toàn bộ
        Election.objects.filter(pk=election.pk).update(description=meta['description'], metadata_loaded=True)
        for opt in election.options.all():
            if opt.option_id < len(meta['options']) and meta['options'][opt.option_id]['label'] == opt.label:
                m = meta['options'][opt.option_id]
                Option.objects.filter(pk=opt.pk).update(description=m['description'], image_cid=m['image'])

# Xóa sạch dữ liệu cũ bị sai và quét lại từ đầu cho 1 hòm phiếu cụ thể
def rebuild_election(w3, election, block):
    """Xoá toàn bộ phiếu/whitelist trong DB của hòm phiếu rồi dựng lại từ event on-chain."""
    with transaction.atomic():
        VoteRecord.objects.filter(election=election).delete()
        WhitelistEntry.objects.filter(election=election).delete()
        Option.objects.filter(election=election).update(vote_count=0)
        Election.objects.filter(pk=election.pk).update(total_voters=0)
    scan_logs(w3, max(election.created_block, 0), block, addresses=[election.contract_addr])
    _log_sys('WARNING', f'Đã dựng lại dữ liệu hòm phiếu {election.contract_addr} từ chain')

# Quét đối soát cho toàn bộ hệ thống
def reconcile_all(w3, only_active=True):
    """Đối soát mọi hòm phiếu chưa kết thúc (và các hòm vừa kết thúc chưa đối soát lại)."""
    qs = Election.objects.all()
    if only_active:
        qs = qs.filter(closed_by_owner=False) # Bỏ qua các hòm phiếu đã đóng lâu rồi để đỡ tốn tài nguyên
    results = {}
    block = w3.eth.block_number
    for e in qs:
        try:
            r = reconcile_election(w3, e, block)
            if r:
                results[e.contract_addr] = r
        except Exception as ex:  # Bắt lỗi độc lập: 1 hòm phiếu lỗi không làm chết cả kịch bản đối soát
            logger.exception('Lỗi đối soát %s', e.contract_addr)
            _log_sys('ERROR', f'Đối soát {e.contract_addr} lỗi: {type(ex).__name__}: {ex}')
    return results

# Trạng thái indexer (Theo dõi tiến độ quét khối)
# Lấy mốc block cuối cùng đã xử lý thành công để lần sau chạy tiếp từ đây
def get_last_block():
    return IndexerState.objects.filter(key='main').values_list('last_block', flat=True).first() or 0

# Cập nhật mốc block vừa quét xong
def set_last_block(block):
    state, _ = IndexerState.objects.get_or_create(key='main')
    if block > state.last_block:
        state.last_block = block
    state.save()  # luôn save để trường updated_at (nhịp tim) được làm mới

# Báo cáo với hệ thống là Indexer (tiến trình chạy ngầm) vẫn đang sống và hoạt động bình thường
def heartbeat():
    state, _ = IndexerState.objects.get_or_create(key='main')
    state.save()