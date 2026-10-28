from django.urls import re_path

from . import consumers

websocket_urlpatterns = [
    # ws://host/ws/election/all/            -> mọi hòm phiếu (trang danh sách)
    # ws://host/ws/election/0x<địa chỉ>/    -> 1 hòm phiếu (trang chi tiết)
    re_path(r'^ws/election/(?P<room>all|0x[0-9a-fA-F]{40})/$', consumers.ElectionConsumer.as_asgi()),
]
