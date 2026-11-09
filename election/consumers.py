import json
from channels.generic.websocket import AsyncWebsocketConsumer

from .realtime import group_name


class ElectionConsumer(AsyncWebsocketConsumer):
    """Kết nối công khai, chỉ NHẬN tin (không nhận lệnh từ client)."""

    async def connect(self):
        self.group = group_name(self.scope['url_route']['kwargs']['room'])
        await self.channel_layer.group_add(self.group, self.channel_name)
        await self.accept()

    async def disconnect(self, close_code):
        await self.channel_layer.group_discard(self.group, self.channel_name)

    async def receive(self, text_data=None, bytes_data=None):
        pass  # bỏ qua mọi dữ liệu client gửi lên

    async def push(self, event):
        await self.send(text_data=json.dumps(event['payload']))
