"""Phát tin realtime tới trình duyệt qua Channels.

Quy ước nhóm (group):
  election_all            -> trang danh sách (nhận mọi hòm phiếu)
  election_<0xaddr lower> -> trang chi tiết của đúng 1 hòm phiếu

Mỗi tin là JSON có trường `type` rõ ràng để frontend xử lý đúng:
  created   : có hòm phiếu mới
  vote      : có phiếu mới (kèm total_voters)
  state     : lịch / trạng thái đổi (đóng sớm, dời lịch)
  whitelist : danh sách cử tri thay đổi
Không đưa dữ liệu nhạy cảm (lỗi RPC, URL…) vào các tin này: kênh WebSocket là công khai.
"""
from channels.layers import get_channel_layer


def group_name(room):
    return f'election_{room.lower()}'


async def publish(messages):
    """messages: danh sách {'groups': [...], 'payload': {...}} do indexer_core trả về."""
    layer = get_channel_layer()
    if layer is None:
        return
    for m in messages:
        for g in m['groups']:
            await layer.group_send(group_name(g), {'type': 'push', 'payload': m['payload']})
