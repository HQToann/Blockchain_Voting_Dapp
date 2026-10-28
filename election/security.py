"""Tiện ích bảo mật dùng chung: lấy IP client đáng tin cậy + rate limit nguyên tử."""
from django.conf import settings
from django.core.cache import cache
from django.http import JsonResponse


def get_client_ip(request):
    """IP thật của client.

    KHÔNG tin phần tử đầu của X-Forwarded-For (do client tự điền, giả mạo được).
    Khi chạy sau N proxy tin cậy (settings.TRUSTED_PROXY_COUNT, Render = 1), phần tử thứ N
    tính từ cuối là địa chỉ mà proxy tin cậy của ta đã thực sự nhìn thấy.
    """
    n = getattr(settings, 'TRUSTED_PROXY_COUNT', 0)
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if n > 0 and xff:
        parts = [p.strip() for p in xff.split(',') if p.strip()]
        if parts:
            return parts[-n] if len(parts) >= n else parts[0]
    return request.META.get('REMOTE_ADDR', '0.0.0.0')


def allow(key, limit, window_seconds):
    """Cửa sổ cố định, đếm nguyên tử (cache.add + cache.incr). True = được phép."""
    ck = f'rl:{key}'
    if cache.add(ck, 1, window_seconds):
        return True
    try:
        return cache.incr(ck) <= limit
    except ValueError:  # khoá vừa hết hạn giữa 2 lệnh
        cache.set(ck, 1, window_seconds)
        return True


def rate_limited(request, scope, limit, window_seconds, identity=None):
    """Trả JsonResponse 429 nếu vượt hạn mức, ngược lại trả None."""
    who = identity or get_client_ip(request)
    if allow(f'{scope}:{who}', limit, window_seconds):
        return None
    return JsonResponse({'error': 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.'}, status=429)
