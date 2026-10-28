"""Ghim ảnh / metadata lên IPFS qua Pinata. Mọi lời gọi đều có timeout; lỗi chi tiết chỉ ghi log
nội bộ, KHÔNG trả nguyên văn cho người dùng (có thể chứa thông tin nhạy cảm)."""
import os
import logging
import requests

from .models import SystemLog

logger = logging.getLogger('election.services')

PINATA_FILE_URL = 'https://api.pinata.cloud/pinning/pinFileToIPFS'
PINATA_JSON_URL = 'https://api.pinata.cloud/pinning/pinJSONToIPFS'
TIMEOUT = (5, 30)  # (connect, read) giây


class IpfsError(Exception):
    """Lỗi ghim IPFS; message an toàn để hiển thị cho người dùng."""


def sniff_image_type(head: bytes):
    """Nhận dạng ảnh theo magic bytes (không tin phần mở rộng/Content-Type do client gửi).
    Cố ý KHÔNG hỗ trợ SVG vì SVG có thể chứa script."""
    if head.startswith(b'\x89PNG\r\n\x1a\n'):
        return 'image/png'
    if head.startswith(b'\xff\xd8\xff'):
        return 'image/jpeg'
    if head[:6] in (b'GIF87a', b'GIF89a'):
        return 'image/gif'
    if head[:4] == b'RIFF' and head[8:12] == b'WEBP':
        return 'image/webp'
    return None


def _headers():
    jwt = os.getenv('PINATA_JWT', '').strip()
    if not jwt:
        raise IpfsError('Máy chủ chưa cấu hình IPFS (PINATA_JWT).')
    return {'Authorization': f'Bearer {jwt}'}


def _log(level, msg):
    try:
        SystemLog.objects.create(level=level, module='IPFS', message=msg[:1000])
    except Exception:  # log không được làm hỏng luồng chính
        logger.exception('Không ghi được SystemLog')


def pin_file(filename, data: bytes, content_type: str, owner: str = ''):
    headers = _headers()
    try:
        r = requests.post(
            PINATA_FILE_URL, headers=headers, timeout=TIMEOUT,
            files={'file': (filename, data, content_type)},
            data={'pinataMetadata': '{"name": "vote-image-%s"}' % owner[:10]},
        )
    except requests.RequestException as e:
        _log('ERROR', f'Pinata lỗi mạng khi ghim ảnh: {type(e).__name__}')
        raise IpfsError('Không kết nối được dịch vụ IPFS, thử lại sau.')
    if r.status_code != 200:
        _log('ERROR', f'Pinata từ chối ghim ảnh: HTTP {r.status_code} {r.text[:200]}')
        raise IpfsError('Dịch vụ IPFS từ chối yêu cầu, thử lại sau.')
    cid = r.json().get('IpfsHash')
    _log('SUCCESS', f'Đã ghim ảnh {cid} cho {owner[:10]}…')
    return cid


def pin_json(obj: dict, name: str = 'vote-metadata', owner: str = ''):
    headers = _headers()
    try:
        r = requests.post(
            PINATA_JSON_URL, headers=headers, timeout=TIMEOUT,
            json={'pinataContent': obj, 'pinataMetadata': {'name': f'{name}-{owner[:10]}'}},
        )
    except requests.RequestException as e:
        _log('ERROR', f'Pinata lỗi mạng khi ghim metadata: {type(e).__name__}')
        raise IpfsError('Không kết nối được dịch vụ IPFS, thử lại sau.')
    if r.status_code != 200:
        _log('ERROR', f'Pinata từ chối ghim metadata: HTTP {r.status_code} {r.text[:200]}')
        raise IpfsError('Dịch vụ IPFS từ chối yêu cầu, thử lại sau.')
    cid = r.json().get('IpfsHash')
    _log('SUCCESS', f'Đã ghim metadata {cid} cho {owner[:10]}…')
    return cid
