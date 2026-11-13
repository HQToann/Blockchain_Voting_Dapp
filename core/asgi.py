"""
ASGI config for core project.
Định tuyến phân luồng HTTP và WebSocket cho Daphne server.
"""

import os
from django.core.asgi import get_asgi_application

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'core.settings')

# 1. Khởi tạo Django ASGI application trước để nạp AppRegistry và models
django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from channels.security.websocket import AllowedHostsOriginValidator
import election.routing

# 2. Định tuyến theo giao thức: HTTP -> Django, WebSocket -> Channels Consumer
application = ProtocolTypeRouter({
    # Yêu cầu HTTP thông thường (Views, REST API, Admin)
    "http": django_asgi_app,

    # Kết nối WebSocket Realtime (/ws/election/all/ và /ws/election/<address>/)
    "websocket": AllowedHostsOriginValidator(
        URLRouter(
            election.routing.websocket_urlpatterns
        )
    ),
})