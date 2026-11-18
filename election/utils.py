"""
Công cụ tiện ích dùng chung:
1. Chuẩn hoá dữ liệu
2. Nạp cấu hình hợp đồng
3. Đảm bảo an toàn giao tiếp giữa Django, Chain Watcher và mạng Blockchain
"""

import os
import re
import json
import logging
from django.conf import settings

logger = logging.getLogger('election.utils')

ADDRESS_RE = re.compile(r'^0x[0-9a-fA-F]{40}$')     # Kiểm tra địa chỉ ví hoặc địa trí smart contract trên mạng Ethereum/EVM
TX_HASH_RE = re.compile(r'^0x[0-9a-f]{64}$')    # Kiểm tra mã giao dịch 
CID_RE = re.compile(r'^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{50,120})$')    # Kiểm tra mã CID của IPFS

# Kiểm tra Input có đúng là địa chỉ ví
def is_address(value):
    return isinstance(value, str) and bool(ADDRESS_RE.match(value))

# Chuyển đổi địa chỉ ví thông thường thành checksum(có hoa/thường xen kẽ)
def to_checksum(value):
    from web3 import Web3
    return Web3.to_checksum_address(value)

# Chuẩn hoá mã băm giao dịch về định dạng chung
def norm_tx_hash(value):
    """
    Chuyển hoá hash giao dịch về dạng 0x + 64 hex chữ thường
    Trả None nếu không hợp lệ.
    (Chấp nhận cả khi người dùng dán hash không có tiền tố 0x.)
    """
    if not isinstance(value, str):
        return None
    v = value.strip().lower()
    if not v.startswith('0x'):
        v = '0x' + v
    return v if TX_HASH_RE.match(v) else None

# Tách lấy mã băn CID từ đường dẫn IPFS do người dùng hoặc Frontend gửi lên
def cid_from_uri(uri):
    """ipfs://'<cid>' hoặc '<cid>' -> cid hợp lệ, ngược lại None"""
    if not uri:
        return None
    u = uri.strip()

    if u.startswith('ipfs://'):
        u = u[len('ipfs://'):]
    u = u.split('/')[0]
    return u if CID_RE.match(u) else None

# Tải tệp tin ABI của Smart Contract vào bộ nhớ của Backend.
def load_abi(name):
    """name = 'Election' | 'Factory' -> đọc <name>_ABI.json ở thư mục gốc dự án."""
    with open(os.path.join(settings.BASE_DIR, f'{name}_ABI.json'), encoding='utf-8') as f:
        return json.load(f)

# Xử lý logic cập nhật địa chỉ Smart Contract khi deploy lại
def get_factory_address():
    """
    Địa chỉ ElectionFactory.
    1. Biến môi trường FACTORY_ADDRESS (khuyến nghị cho production).
    2. File deployed_addresses.json của Hardhat Ignition đúng với CHAIN_ID đang dùng.
    không còn địa chỉ hardcode dự phòng: sai địa chỉ nghĩa là sai toàn bộ dữ liệu, nên
    thà báo thiếu cấu hình còn hơn lặng lẽ dùng nhầm contract cũ.
    """
    env_addr = os.getenv('FACTORY_ADDRESS', '').strip()
    if env_addr:
        return to_checksum(env_addr)
    
    path = os.path.join(
        settings.BASE_DIR, 
        'blockchain', 
        'ignition', 
        'deployments',
        f'chain-{settings.CHAIN_ID}', 'deployed_addresses.json'
    )

    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
        for key, addr in data.items():
            if key.endswith('#ElectionFactory'):
                return to_checksum(addr)
    except FileNotFoundError:
        pass
    except Exception as e:
        logger.warning('Không đọc được %s: %s', path, e)
    return None

# Check địa chỉ nhận vào có là smart contract không
def check_factory_compatible(w3, address):
    """True nếu contract tại `address` có đúng API của Factory mới (electionsCount())."""
    try:
        w3.eth.contract(address=address, abi=load_abi('Factory')).functions.electionsCount().call()
        return True
    except Exception:
        return False

# Bộ cung cấp RPC dự phòng tự động chống lỗi 429

def get_http_rpc_endpoints():
    """Lấy danh sách các URL RPC Sepolia theo thứ tự ưu tiên (Primary -> Fallbacks)."""
    endpoints = []
    
    # 1. RPC chính cấu hình qua INFURA_RPC_URL hoặc RPC_URL
    primary = (os.getenv('INFURA_RPC_URL') or os.getenv('RPC_URL', '')).strip()
    if primary:
        endpoints.append(primary)
        
    # 2. RPC Public cấu hình trong .env (mặc định ethereum-sepolia-rpc.publicnode.com)
    public = (os.getenv('CHAIN_RPC_PUBLIC') or getattr(settings, 'CHAIN_RPC_PUBLIC', '')).strip()
    if public and public not in endpoints:
        endpoints.append(public)
        
    # 3. Các node công cộng dự phòng đáng tin cậy của mạng Sepolia
    known_fallbacks = [
        'https://ethereum-sepolia-rpc.publicnode.com',
        'https://rpc.sepolia.org',
        'https://1rpc.io/sepolia',
        'https://rpc2.sepolia.org',
        'https://sepolia.gateway.tenderly.co',
    ]
    for ep in known_fallbacks:
        if ep not in endpoints:
            endpoints.append(ep)
            
    return endpoints


from web3.providers.rpc import HTTPProvider

class FallbackHTTPProvider(HTTPProvider):
    """
    HTTPProvider kế thừa web3.providers.rpc.HTTPProvider (BaseProvider) với cơ chế:
    1. Tự động chuyển endpoint dự phòng khi gặp 429 (Rate Limit / Quota Exceeded) hoặc lỗi mạng 5xx.
    2. Tự động chuyển tiếp các truy vấn kế tiếp sang node đang hoạt động tốt.
    3. Tự động Exponential Backoff khi tất cả node đều bị chậm.
    """
    def __init__(self, endpoints, request_kwargs=None, session=None):
        if isinstance(endpoints, str):
            endpoints = [endpoints]
        self.endpoints = [e.strip() for e in endpoints if e and e.strip()]
        if not self.endpoints:
            raise ValueError("Phải có ít nhất 1 endpoint RPC!")
        self.current_idx = 0
        kwargs = request_kwargs or {'timeout': 20}
        super().__init__(endpoint_uri=self.endpoints[0], request_kwargs=kwargs, session=session)

    def _switch_to_next(self, reason=''):
        prev = self.endpoints[self.current_idx]
        self.current_idx = (self.current_idx + 1) % len(self.endpoints)
        next_ep = self.endpoints[self.current_idx]
        self.endpoint_uri = next_ep
        logger.warning(
            "⚠️ RPC [%s] lỗi (%s). Tự động chuyển sang RPC dự phòng: [%s]",
            prev, reason, next_ep
        )

    def make_request(self, method, params):
        import time
        max_attempts = len(self.endpoints) * 2
        last_exc = None

        for attempt in range(max_attempts):
            try:
                response = super().make_request(method, params)
                if isinstance(response, dict) and 'error' in response:
                    err = response['error']
                    err_msg = str(err).lower()
                    if any(k in err_msg for k in ['rate', 'limit', '429', 'exceeded', 'too many requests']):
                        if len(self.endpoints) > 1:
                            self._switch_to_next(f"JSON-RPC rate limit: {err}")
                            time.sleep(min(1.0 * (attempt + 1), 3.0))
                            continue
                return response
            except Exception as exc:
                last_exc = exc
                err_str = str(exc).lower()
                is_rate_limit = any(k in err_str for k in ['429', 'too many requests', 'rate limit', 'quota exceeded'])
                is_transient = any(k in err_str for k in ['timeout', 'connection', '502', '503', '504', 'bad gateway'])

                if (is_rate_limit or is_transient) and len(self.endpoints) > 1:
                    self._switch_to_next(f"{type(exc).__name__}: {exc}")
                    time.sleep(min(1.0 * (attempt + 1), 3.0))
                    continue
                elif is_rate_limit:
                    sleep_time = min(2 ** attempt, 8)
                    logger.warning("RPC [%s] bị 429 Rate Limit. Đang chờ %ss...", self.endpoint_uri, sleep_time)
                    time.sleep(sleep_time)
                    continue
                else:
                    raise exc

        raise last_exc


def create_resilient_w3(timeout=20):
    """Tạo đối tượng Web3 HTTP đã tích hợp Fallback RPC và chống lỗi 429."""
    from web3 import Web3
    endpoints = get_http_rpc_endpoints()
    provider = FallbackHTTPProvider(endpoints, request_kwargs={'timeout': timeout})
    return Web3(provider)
