"""
API của nền tảng hòm phiếu cộng đồng.

Nguyên tắc:
  * Chỉ ĐỌC dữ liệu đã được Chain Watcher dựng từ blockchain. Không có API nào cho phép
    "khai báo" phiếu hay kết quả — nên không thể làm giả dữ liệu qua HTTP.
  * Đăng nhập bằng chữ ký ví chỉ để dùng tính năng tốn tài nguyên của server (upload IPFS).
    Mọi quyền sở hữu hòm phiếu được quyết định ON-CHAIN (contract kiểm tra msg.sender).
  * Mọi POST đều qua CSRF của Django (frontend gửi header X-CSRFToken).
"""
import json
import logging
import os
import secrets

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.decorators.http import require_GET, require_POST
from eth_account import Account
from eth_account.messages import encode_defunct
from web3 import Web3

from . import indexer_core as core
from .metadata import MetadataError, validate_metadata
from .models import Election, IndexerState, MetadataBlob, VoteRecord, WhitelistEntry
from .security import allow, rate_limited
from .services import IpfsError, pin_file, pin_json, sniff_image_type
from .utils import ADDRESS_RE, get_factory_address, is_address, norm_tx_hash, to_checksum

logger = logging.getLogger('election.views')

NONCE_TTL = 300  # giây


def _err(message, status=400):
    return JsonResponse({'error': message}, status=status)


def _body_json(request):
    try:
        return json.loads(request.body.decode('utf-8') or '{}')
    except (ValueError, UnicodeDecodeError):
        return None


def _iso(dt):
    return dt.isoformat() if dt else None


def _image_url(cid):
    return f'{settings.IPFS_GATEWAY}/{cid}' if cid else None


def _int_param(request, name, default, lo, hi):
    try:
        v = int(request.GET.get(name, default))
    except (TypeError, ValueError):
        v = default
    return max(lo, min(hi, v))


def _get_election_or_404(address):
    if not is_address(address):
        return None, _err('Địa chỉ hòm phiếu không hợp lệ.', 400)
    e = Election.objects.filter(contract_addr=to_checksum(address)).first()
    if e is None:
        return None, _err('Không tìm thấy hòm phiếu (có thể đang được đồng bộ từ blockchain).', 404)
    if e.is_hidden:
        return None, _err('Hòm phiếu này đã bị ẩn bởi quản trị nền tảng.', 410)
    return e, None


# =====================================================================
# Cấu hình + sức khoẻ hệ thống
# =====================================================================

@ensure_csrf_cookie      # đặt cookie csrftoken để frontend gửi kèm các POST sau đó
@require_GET
def config(request):
    return JsonResponse({
        'chain_id': settings.CHAIN_ID,
        'chain_name': settings.CHAIN_NAME,
        'rpc_url': settings.CHAIN_RPC_PUBLIC,
        'explorer_url': settings.EXPLORER_URL,
        'currency': settings.CURRENCY_SYMBOL,
        'factory_address': get_factory_address(),
        'ipfs_gateway': settings.IPFS_GATEWAY,
        'ipfs_enabled': bool(os.getenv('PINATA_JWT')),
        'limits': {
            'max_options': 50, 'min_options': 2, 'max_name_bytes': 200, 'max_label_bytes': 100,
            'max_whitelist_batch': 200, 'max_image_bytes': settings.MAX_IMAGE_BYTES,
            'max_description': 2000,
        },
    })


def _indexer_info():
    st = IndexerState.objects.filter(key='main').first()
    if not st:
        return {'last_block': 0, 'updated_at': None, 'lagging': True}
    age = (timezone.now() - st.updated_at).total_seconds()
    return {'last_block': st.last_block, 'updated_at': _iso(st.updated_at),
            'lagging': age > settings.INDEXER_STALE_SECONDS}


@require_GET
def health(request):
    return JsonResponse({'status': 'ok', 'factory_configured': bool(get_factory_address()),
                         'indexer': _indexer_info()})


# =====================================================================
# Đăng nhập bằng chữ ký ví (chỉ phục vụ upload IPFS)
# =====================================================================

def login_message(request, nonce):
    """Thông điệp ký. Có cả domain + chain để chữ ký không dùng lại được ở nơi khác."""
    return (
        'Đăng nhập Nền tảng Hòm phiếu Cộng đồng\n\n'
        'Chữ ký này chỉ chứng minh bạn sở hữu ví. Không tốn phí gas, không cấp quyền chuyển tiền.\n\n'
        f'Domain: {request.get_host()}\n'
        f'Chain ID: {settings.CHAIN_ID}\n'
        f'Nonce: {nonce}'
    )


@require_GET
def auth_nonce(request):
    limited = rate_limited(request, 'nonce', 20, 60)
    if limited:
        return limited
    nonce = secrets.token_hex(16)
    cache.set(f'nonce:{nonce}', 1, NONCE_TTL)
    return JsonResponse({'nonce': nonce, 'message': login_message(request, nonce)})


@require_POST
def auth_verify(request):
    limited = rate_limited(request, 'login', 10, 60)
    if limited:
        return limited
    data = _body_json(request)
    if not isinstance(data, dict):
        return _err('Dữ liệu không hợp lệ.')
    address, signature, nonce = data.get('address'), data.get('signature'), data.get('nonce')
    if not (is_address(address) and isinstance(signature, str) and isinstance(nonce, str)):
        return _err('Thiếu địa chỉ, chữ ký hoặc nonce.')

    # Nonce dùng MỘT LẦN: xoá khỏi cache là hết giá trị, kể cả khi kẻ khác có chữ ký này.
    # (cache.delete trả True chỉ với người đầu tiên xoá được khoá.)
    if not cache.delete(f'nonce:{nonce}'):
        return _err('Nonce không hợp lệ hoặc đã hết hạn, hãy thử lại.', 401)

    try:
        recovered = Account.recover_message(encode_defunct(text=login_message(request, nonce)), signature=signature)
    except Exception:
        return _err('Chữ ký không hợp lệ.', 401)
    if recovered.lower() != address.lower():
        return _err('Chữ ký không khớp với địa chỉ ví.', 401)

    request.session.flush()
    request.session['wallet'] = to_checksum(address)
    return JsonResponse({'success': True, 'address': to_checksum(address)})


@require_GET
def auth_me(request):
    return JsonResponse({'address': request.session.get('wallet')})


@require_POST
def auth_logout(request):
    request.session.flush()
    return JsonResponse({'success': True})


# =====================================================================
# Danh sách / chi tiết hòm phiếu (đọc từ DB do watcher dựng)
# =====================================================================

def _summary(e, option_count=None):
    return {
        'address': e.contract_addr,
        'name': e.name,
        'kind': e.kind,
        'is_private': e.is_private,
        'max_choices': e.max_choices,
        'status': e.status,
        'start_time': _iso(e.start_time),
        'end_time': _iso(e.end_time),
        'total_voters': e.total_voters,
        'option_count': option_count if option_count is not None else e.options.count(),
        'owner': e.owner_address,
        'created_at': _iso(e.created_at),
    }


def _apply_status_filter(qs, status, now):
    if status == 'open':
        return qs.filter(closed_by_owner=False, start_time__lte=now).filter(Q(end_time__isnull=True) | Q(end_time__gt=now))
    if status == 'upcoming':
        return qs.filter(closed_by_owner=False, start_time__gt=now)
    if status == 'ended':
        return qs.filter(closed_by_owner=False, end_time__lte=now)
    if status == 'closed':
        return qs.filter(closed_by_owner=True)
    if status == 'finished':      # đã kết thúc theo bất kỳ cách nào
        return qs.filter(Q(closed_by_owner=True) | Q(end_time__lte=now))
    return qs


@require_GET
def elections_list(request):
    qs = Election.objects.filter(is_hidden=False).annotate(n_options=Count('options', distinct=True))
    now = timezone.now()
    qs = _apply_status_filter(qs, request.GET.get('status', 'all'), now)

    kind = request.GET.get('kind')
    if kind in ('0', '1'):
        qs = qs.filter(kind=int(kind))
    owner = request.GET.get('owner')
    if owner:
        if not is_address(owner):
            return _err('Địa chỉ owner không hợp lệ.')
        qs = qs.filter(owner_address=to_checksum(owner))
    voted = request.GET.get('voted')
    if voted:
        if not is_address(voted):
            return _err('Địa chỉ ví không hợp lệ.')
        qs = qs.filter(pk__in=VoteRecord.objects.filter(voter_address=to_checksum(voted)).values('election_id'))
    q = (request.GET.get('q') or '').strip()
    if q:
        cond = Q(name__icontains=q[:100])
        if ADDRESS_RE.match(q):
            cond |= Q(contract_addr__iexact=q) | Q(owner_address__iexact=q)
        qs = qs.filter(cond)

    page_size = _int_param(request, 'page_size', 12, 1, 50)
    page = _int_param(request, 'page', 1, 1, 10_000)
    total = qs.count()
    rows = list(qs[(page - 1) * page_size: page * page_size])
    return JsonResponse({
        'elections': [_summary(e, e.n_options) for e in rows],
        'page': page, 'page_size': page_size, 'total': total,
        'pages': max(1, -(-total // page_size)),
        'indexer': _indexer_info(),
    })


@require_GET
def election_detail(request, address):
    e, err = _get_election_or_404(address)
    if err:
        return err
    options = []
    for o in e.options.all():
        options.append({
            'id': o.option_id, 'label': o.label, 'description': o.description,
            'image_url': _image_url(o.image_cid), 'votes': o.vote_count,
            # % cử tri đã chọn lựa chọn này (tổng có thể > 100% khi được chọn nhiều đáp án)
            'percent': round(o.vote_count * 100 / e.total_voters, 1) if e.total_voters else 0,
        })
    data = _summary(e, len(options))
    data.update({
        'description': e.description, 'options': options,
        'metadata_uri': e.metadata_uri, 'created_tx_hash': e.created_tx_hash,
        'server_time': _iso(timezone.now()),
        'whitelist_count': e.whitelist.count() if e.is_private else None,
        'indexer': _indexer_info(),
    })
    return JsonResponse(data)


@require_GET
def election_voters(request, address):
    e, err = _get_election_or_404(address)
    if err:
        return err
    labels = {o.option_id: o.label for o in e.options.all()}
    page_size = _int_param(request, 'page_size', 25, 1, 100)
    page = _int_param(request, 'page', 1, 1, 10_000)
    qs = VoteRecord.objects.filter(election=e)
    voter = request.GET.get('voter')
    if voter:
        if not is_address(voter):
            return _err('Địa chỉ ví không hợp lệ.')
        qs = qs.filter(voter_address=to_checksum(voter))
    total = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    return JsonResponse({
        'total': total, 'page': page, 'pages': max(1, -(-total // page_size)),
        'votes': [{
            'voter': v.voter_address, 'choices': v.choices,
            'choice_labels': [labels.get(c, f'#{c}') for c in v.choices],
            'tx_hash': v.tx_hash, 'block': v.block_number, 'time': _iso(v.created_at),
        } for v in rows],
    })


@require_GET
def election_whitelist(request, address):
    e, err = _get_election_or_404(address)
    if err:
        return err
    if not e.is_private:
        return JsonResponse({'is_private': False, 'total': 0, 'entries': []})
    voted = set(VoteRecord.objects.filter(election=e).values_list('voter_address', flat=True))
    page_size = _int_param(request, 'page_size', 100, 1, 200)
    page = _int_param(request, 'page', 1, 1, 10_000)
    qs = WhitelistEntry.objects.filter(election=e)
    total = qs.count()
    rows = qs[(page - 1) * page_size: page * page_size]
    return JsonResponse({
        'is_private': True, 'total': total, 'page': page, 'pages': max(1, -(-total // page_size)),
        'entries': [{'address': w.voter_address, 'voted': w.voter_address in voted} for w in rows],
    })


# =====================================================================
# Xác minh một giao dịch bỏ phiếu (công khai, chỉ đọc)
# =====================================================================

def get_http_w3():
    url = os.getenv('INFURA_RPC_URL') or os.getenv('RPC_URL', '')
    if not url:
        return None
    return Web3(Web3.HTTPProvider(url, request_kwargs={'timeout': 10}))


def _vote_payload(v):
    e = v.election
    labels = {o.option_id: o.label for o in e.options.all()}
    return {
        'election': {'address': e.contract_addr, 'name': e.name},
        'voter': v.voter_address, 'choices': v.choices,
        'choice_labels': [labels.get(c, f'#{c}') for c in v.choices],
        'tx_hash': v.tx_hash, 'block': v.block_number, 'time': _iso(v.created_at),
    }


@require_GET
def verify_tx(request):
    limited = rate_limited(request, 'verify', 30, 60)
    if limited:
        return limited
    tx = norm_tx_hash(request.GET.get('tx', ''))
    if not tx:
        return _err('Mã giao dịch không hợp lệ (cần 64 ký tự hex, có hoặc không có 0x).')

    v = VoteRecord.objects.select_related('election').filter(tx_hash=tx).first()
    if v:
        return JsonResponse({'status': 'confirmed', **_vote_payload(v)})

    w3 = get_http_w3()
    if w3 is None:
        return _err('Máy chủ chưa cấu hình kết nối blockchain.', 503)
    try:
        receipt = w3.eth.get_transaction_receipt(tx)
    except Exception as exc:
        if exc.__class__.__name__ == 'TransactionNotFound':
            return JsonResponse({'status': 'not_found'})
        logger.warning('verify_tx RPC lỗi: %s', type(exc).__name__)
        return _err('Không truy vấn được blockchain lúc này, thử lại sau.', 503)

    if receipt['status'] != 1:
        return JsonResponse({'status': 'failed'})

    # Giao dịch thành công: có phải phiếu bầu của hòm phiếu nào thuộc nền tảng không?
    for log in receipt['logs']:
        if not log['topics']:
            continue
        entry = core.topic_map().get(core._hex(log['topics'][0]))
        if not entry or entry[1] != 'VoteCast':
            continue
        e = Election.objects.filter(contract_addr=to_checksum(log['address'])).first()
        if e is None:
            continue
        return JsonResponse({
            'status': 'pending_index',
            'election': {'address': e.contract_addr, 'name': e.name},
            'block': receipt['blockNumber'],
        })
    return JsonResponse({'status': 'not_vote'})


# =====================================================================
# Upload IPFS (cần đăng nhập ví + giới hạn tần suất)
# =====================================================================

def _require_wallet(request):
    wallet = request.session.get('wallet')
    if not wallet:
        return None, _err('Bạn cần đăng nhập bằng ví (ký tin nhắn) trước.', 401)
    return wallet, None


def _too_big(request, limit):
    """Từ chối sớm theo Content-Length, TRƯỚC khi Django đọc/phân tích body."""
    try:
        return int(request.META.get('CONTENT_LENGTH') or 0) > limit
    except ValueError:
        return True


def _upload_quota(wallet):
    if not allow('upload:global', 2000, 86400):
        return _err('Hệ thống đang quá tải lượt upload hôm nay, vui lòng quay lại sau.', 429)
    if not allow(f'upload:{wallet}', settings.UPLOADS_PER_HOUR, 3600):
        return _err('Bạn đã upload quá nhiều trong 1 giờ qua, vui lòng thử lại sau.', 429)
    return None


@require_POST
def upload_image(request):
    wallet, err = _require_wallet(request)
    if err:
        return err
    if _too_big(request, settings.MAX_IMAGE_BYTES + 64 * 1024):   # + phần header multipart
        return _err(f'Ảnh quá lớn (tối đa {settings.MAX_IMAGE_BYTES // 1024 // 1024} MB).', 413)
    quota = _upload_quota(wallet)
    if quota:
        return quota
    f = request.FILES.get('image')
    if f is None:
        return _err('Thiếu file ảnh (trường "image").')
    if f.size > settings.MAX_IMAGE_BYTES:
        return _err(f'Ảnh quá lớn (tối đa {settings.MAX_IMAGE_BYTES // 1024 // 1024} MB).', 413)
    data = f.read(settings.MAX_IMAGE_BYTES + 1)
    mime = sniff_image_type(data[:16])
    if mime is None:
        return _err('Chỉ chấp nhận ảnh PNG, JPEG, GIF hoặc WebP.', 415)
    try:
        cid = pin_file('image', data, mime, owner=wallet)
    except IpfsError as ex:
        return _err(str(ex), 502)
    return JsonResponse({'cid': cid, 'url': _image_url(cid)})


@require_POST
def upload_metadata(request):
    wallet, err = _require_wallet(request)
    if err:
        return err
    if _too_big(request, settings.MAX_METADATA_BYTES):
        return _err('Metadata quá lớn.', 413)
    quota = _upload_quota(wallet)
    if quota:
        return quota
    data = _body_json(request)
    try:
        clean = validate_metadata(data)
    except MetadataError as ex:
        return _err(str(ex))
    try:
        cid = pin_json(clean, owner=wallet)
    except IpfsError as ex:
        return _err(str(ex), 502)
    MetadataBlob.objects.get_or_create(cid=cid, defaults={'owner_address': wallet, 'content': clean})
    return JsonResponse({'cid': cid, 'uri': cid})
