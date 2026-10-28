"""Metadata off-chain của hòm phiếu (mô tả + ảnh/mô tả từng lựa chọn), lưu trên IPFS.

Định dạng (version 1):
{
  "version": 1,
  "description": "…",
  "options": [ {"label": "An", "description": "…", "image": "<cid>"} , … ]   # cùng thứ tự với on-chain
}
`label` chỉ để đối chiếu: nhãn thật nằm on-chain; metadata không khớp nhãn thì bỏ qua phần đó.
"""
import json
import logging
import requests
from django.conf import settings

from .models import MetadataBlob
from .utils import cid_from_uri, CID_RE

logger = logging.getLogger('election.metadata')

MAX_DESC = 2000
MAX_OPT_DESC = 500
MAX_LABEL = 100
MAX_OPTIONS = 50


class MetadataError(ValueError):
    pass


def validate_metadata(obj):
    """Kiểm tra và CHUẨN HOÁ metadata do người dùng gửi (loại bỏ khoá lạ). Ném MetadataError."""
    if not isinstance(obj, dict):
        raise MetadataError('Metadata phải là một đối tượng JSON.')
    desc = obj.get('description', '')
    if not isinstance(desc, str) or len(desc) > MAX_DESC:
        raise MetadataError(f'Mô tả tối đa {MAX_DESC} ký tự.')
    options_in = obj.get('options', [])
    if not isinstance(options_in, list) or len(options_in) > MAX_OPTIONS:
        raise MetadataError(f'Tối đa {MAX_OPTIONS} lựa chọn.')
    options = []
    for o in options_in:
        if not isinstance(o, dict):
            raise MetadataError('Mỗi lựa chọn phải là một đối tượng.')
        label = o.get('label', '')
        od = o.get('description', '')
        img = o.get('image', '')
        if not isinstance(label, str) or not (1 <= len(label.encode()) <= MAX_LABEL):
            raise MetadataError('Nhãn lựa chọn không hợp lệ.')
        if not isinstance(od, str) or len(od) > MAX_OPT_DESC:
            raise MetadataError(f'Mô tả lựa chọn tối đa {MAX_OPT_DESC} ký tự.')
        if not isinstance(img, str) or (img and not CID_RE.match(img)):
            raise MetadataError('Ảnh phải là CID IPFS hợp lệ.')
        options.append({'label': label, 'description': od, 'image': img})
    return {'version': 1, 'description': desc, 'options': options}


def fetch_from_gateway(cid):
    """Lấy metadata từ gateway IPFS công khai (best-effort, giới hạn dung lượng & thời gian)."""
    try:
        r = requests.get(f'{settings.IPFS_GATEWAY}/{cid}', timeout=(3, 6), stream=True)
        if r.status_code != 200:
            return None
        raw = r.raw.read(settings.MAX_METADATA_BYTES + 1, decode_content=True)
        if len(raw) > settings.MAX_METADATA_BYTES:
            return None
        return validate_metadata(json.loads(raw.decode('utf-8')))
    except (requests.RequestException, ValueError, UnicodeDecodeError, MetadataError):
        return None


def load_metadata(uri):
    """Trả metadata đã chuẩn hoá hoặc None. Ưu tiên bản sao trong DB, sau đó mới gọi gateway."""
    cid = cid_from_uri(uri)
    if not cid:
        return None
    blob = MetadataBlob.objects.filter(cid=cid).first()
    if blob:
        try:
            return validate_metadata(blob.content)
        except MetadataError:
            return None
    return fetch_from_gateway(cid)
