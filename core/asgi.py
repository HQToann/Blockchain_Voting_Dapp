"""
ASGI config for core project.

It exposes the ASGI callable as a module-level variable named ``application``.

For more information on this file, see
https://docs.djangoproject.com/en/5.2/howto/deployment/asgi/
"""

import os

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

from django.core.asgi import get_asgi_application

django_asgi_app = get_asgi_application()   # phải khởi tạo Django TRƯỚC khi import code dùng models

from channels.routing import ProtocolTypeRouter, URLRouter          # noqa: E402
from channels.security.websocket import AllowedHostsOriginValidator  # noqa: E402

import election.routing                                              # noqa: E402

application = ProtocolTypeRouter({
    'http': django_asgi_app,
    # Chỉ nhận WebSocket từ trang web của chính mình (chặn trang lạ nhúng kết nối vào kênh).
    'websocket': AllowedHostsOriginValidator(
        URLRouter(election.routing.websocket_urlpatterns)
    ),
})