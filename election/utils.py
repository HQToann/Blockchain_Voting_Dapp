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

    if u.startswitch('ipfs://'):
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