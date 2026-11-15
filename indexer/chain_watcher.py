"""
CHAIN WATCHER v3 — nghe blockchain và dựng dữ liệu cho nền tảng hòm phiếu cộng đồng.

Vai trò: backend không ghi gì lên chain (không có private key). Tất cả thao tác (tạo hòm phiếu,
bỏ phiếu, whitelist, đóng...) do ví người dùng ký trực tiếp. Watcher chỉ đọc event rồi cập nhật DB
và đẩy tin realtime. Logic xử lý nằm trong election/indexer_core.py (đã có test trên EVM thật).

Cách hoạt động:
  1. Mở WebSocket tới node và đăng ký nhận event trước (Factory + mọi hòm phiếu + block mới).
  2. Sau đó mới "bắt kịp" các block đã bỏ lỡ (catch-up, xử lý mọi loại event). Vì đã đăng ký trước
     nên không có khoảng hở; xử lý trùng không sao vì mọi bước đều idempotent.
  3. Đối soát với trạng thái thật trên chain (số phiếu, lịch, đóng sớm) — tự sửa nếu DB lệch.
     Chạy sau catch-up và định kỳ (mặc định 5 phút).
  4. Mỗi block mới: cập nhật `last_block` + nhịp tim để API biết watcher còn sống.
  5. Mất kết nối -> tự kết nối lại (backoff) và lặp lại bước 1-3.
"""
import asyncio
import logging
import os
import sys

import django

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')
django.setup()

from asgiref.sync import sync_to_async
from django.db import close_old_connections
from web3 import AsyncWeb3, Web3
from web3.providers.persistent import WebSocketProvider
from web3.utils.subscriptions import LogsSubscription

from election import indexer_core as core
from election.models import Election
from election.realtime import publish
from election.utils import check_factory_compatible, get_factory_address

logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s %(name)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger('chain_watcher')

RECONCILE_INTERVAL = int(os.getenv('RECONCILE_INTERVAL', 300))
HEARTBEAT_INTERVAL = 30
ADDR_PER_SUBSCRIPTION = 50          # giới hạn địa chỉ trên mỗi subscription (RPC thường giới hạn)


def _rpc_url():
    url = (os.getenv('INFURA_RPC_URL') or os.getenv('RPC_URL', '')).strip()
    if not url:
        logger.error('Thiếu cấu hình RPC URL (INFURA_RPC_URL / RPC_URL) — không thể chạy watcher.')
        sys.exit(1)
    return url


def _wss_url(http_url):
    explicit = (os.getenv('INFURA_WSS_URL') or os.getenv('WSS_URL', '')).strip()
    if explicit:
        return explicit
    # Tự động định dạng WebSocket cho Infura nếu chỉ cung cấp URL HTTP:
    # https://sepolia.infura.io/v3/<KEY> -> wss://sepolia.infura.io/ws/v3/<KEY>
    if 'infura.io/v3/' in http_url and '/ws/v3/' not in http_url:
        return http_url.replace('https://', 'wss://').replace('http://', 'ws://').replace('/v3/', '/ws/v3/')
    if http_url.startswith('https://'):
        return 'wss://' + http_url[len('https://'):]
    if http_url.startswith('http://'):
        return 'ws://' + http_url[len('http://'):]
    return http_url


RPC_URL = _rpc_url()
WSS_URL = _wss_url(RPC_URL)
FACTORY = get_factory_address()
if not FACTORY:
    logger.error('Chưa cấu hình FACTORY_ADDRESS (hoặc chưa deploy Factory cho CHAIN_ID hiện tại).')
    sys.exit(1)

w3_http = Web3(Web3.HTTPProvider(RPC_URL, request_kwargs={'timeout': 20}))

# Cầu nối sync -> async: mọi thao tác DB/RPC chạy trong thread, DB connection được dọn đúng cách

def _db(fn):
    def wrapper(*a, **kw):
        close_old_connections()
        try:
            return fn(*a, **kw)
        finally:
            close_old_connections()
    return sync_to_async(wrapper)


@_db
def _process_log(log):
    return core.process_log(w3_http, log, FACTORY)


@_db
def _catch_up_sync(from_block, to_block):
    return core.scan_logs(w3_http, from_block, to_block, FACTORY, on_batch=lambda end: core.set_last_block(end))


@_db
def _reconcile_all_sync():
    return core.reconcile_all(w3_http)


@_db
def _reconcile_one_sync(address):
    e = Election.objects.filter(contract_addr__iexact=address).first()
    return core.reconcile_election(w3_http, e) if e else {}


@_db
def _election_addresses():
    from django.utils import timezone
    from django.db.models import Q
    now = timezone.now()
    # Chỉ trả về các hòm phiếu Đang mở hoặc Sắp diễn ra
    return list(Election.objects.filter(closed_by_owner=False)
                .filter(Q(end_time__isnull=True) | Q(end_time__gt=now))
                .values_list('contract_addr', flat=True))


@_db
def _get_last_block():
    return core.get_last_block()


@_db
def _set_last_block(n):
    core.set_last_block(n)


@_db
def _heartbeat():
    try:
        head = w3_http.eth.block_number
        core.set_last_block(head)
    except Exception:
        pass
    core.heartbeat()

# Catch-up + đối soát

async def catch_up():
    head = await asyncio.to_thread(lambda: w3_http.eth.block_number)
    last = await _get_last_block()
    if last == 0:
        start_env = os.getenv('START_BLOCK', '').strip()
        if start_env:
            last = int(start_env)
        else:
            logger.warning('Lần chạy đầu và chưa đặt START_BLOCK: bắt đầu từ block hiện tại %s. '
                           'Hòm phiếu tạo TRƯỚC thời điểm này sẽ không được index — đặt START_BLOCK = block deploy Factory.', head)
            await _set_last_block(head + 1)
            return
    if last > head:
        return
    logger.info('🔄 Catch-up block %s → %s ...', last, head)
    msgs = await _catch_up_sync(last, head)
    await publish(msgs)
    logger.info('✅ Catch-up xong (%s tin).', len(msgs))


async def reconcile():
    fixed = await _reconcile_all_sync()
    if fixed:
        logger.warning('🛠  Đối soát đã sửa: %s', fixed)
        await publish([{'groups': ['all'], 'payload': {'type': 'state'}}])

# Handlers nhận event realtime

subscribed = set()      # địa chỉ hòm phiếu đã đăng ký (chữ thường)


async def election_logs_handler(context):
    log = context.result
    try:
        if log.get('removed'):
            # Block bị reorg: không tin log này, đối soát lại hòm phiếu theo trạng thái thật.
            logger.warning('Log bị reorg tại %s -> đối soát lại', log['address'])
            await _reconcile_one_sync(log['address'])
            return
        msgs = await _process_log(log)
        await publish(msgs)
    except Exception:
        logger.exception('Lỗi xử lý log hòm phiếu')


async def factory_logs_handler(context):
    log = context.result
    try:
        msgs = await _process_log(log)
        await publish(msgs)
        for m in msgs:
            if m['payload'].get('type') == 'created':
                await _subscribe_election(context.async_w3, m['payload']['election'])
    except Exception:
        logger.exception('Lỗi xử lý log Factory')


async def _subscribe_election(async_w3, address):
    key = address.lower()
    if key in subscribed:
        return
    subscribed.add(key)
    await async_w3.subscription_manager.subscribe(
        [LogsSubscription(address=Web3.to_checksum_address(address), handler=election_logs_handler)])
    logger.info('➕ Theo dõi hòm phiếu %s', address)


# Vòng lặp chính

async def background_jobs():
    """Chạy song song với việc nhận event: catch-up, đối soát, nhịp tim."""
    try:
        await catch_up()
        await reconcile()
    except Exception:
        logger.exception('Lỗi catch-up/đối soát ban đầu')
    ticks = 0
    while True:
        await asyncio.sleep(HEARTBEAT_INTERVAL)
        try:
            await _heartbeat()
            ticks += 1
            if ticks * HEARTBEAT_INTERVAL >= RECONCILE_INTERVAL:
                ticks = 0
                await reconcile()
        except Exception:
            logger.exception('Lỗi tác vụ định kỳ')


async def watch_forever():
    backoff = 5
    while True:
        task = None
        try:
            if not await asyncio.to_thread(check_factory_compatible, w3_http, FACTORY):
                logger.error('Contract tại %s KHÔNG phải ElectionFactory phiên bản mới (thiếu electionsCount()). '
                             'Hãy deploy lại Factory mới và cập nhật FACTORY_ADDRESS.', FACTORY)
                await asyncio.sleep(60)
                continue

            websocket_kwargs = {'ping_interval': 30, 'ping_timeout': 10}
            async with AsyncWeb3(WebSocketProvider(WSS_URL, websocket_kwargs=websocket_kwargs)) as w3:
                subscribed.clear()
                addrs = await _election_addresses()
                subs = [
                    LogsSubscription(address=FACTORY, handler=factory_logs_handler),
                ]
                for i in range(0, len(addrs), ADDR_PER_SUBSCRIPTION):
                    chunk = [Web3.to_checksum_address(a) for a in addrs[i:i + ADDR_PER_SUBSCRIPTION]]
                    subs.append(LogsSubscription(address=chunk, handler=election_logs_handler))
                    subscribed.update(a.lower() for a in chunk)
                await w3.subscription_manager.subscribe(subs)
                logger.info('Đang lắng nghe realtime: Factory + %s hòm phiếu.', len(addrs))

                task = asyncio.create_task(background_jobs())    # catch-up SAU khi đã đăng ký
                backoff = 5
                await w3.subscription_manager.handle_subscriptions(run_forever=True)
        except Exception as e:
            logger.error('Mất kết nối (%s: %s) — thử lại sau %ss', type(e).__name__, e, backoff)
        finally:
            if task:
                task.cancel()
        await asyncio.sleep(backoff)
        backoff = min(backoff * 2, 60)


async def run_once():
    await catch_up()
    await reconcile()
    await _heartbeat()
    logger.info('Hoàn tất (--once).')


if __name__ == '__main__':
    if '--once' in sys.argv:
        asyncio.run(run_once())
    else:
        logger.info('Chain Watcher v3 khởi động. Factory=%s', FACTORY)
        asyncio.run(watch_forever())
