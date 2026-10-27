"""
Mô hình dữ liệu của nền tảng hòm phiếu cộng đồng.

NGUYÊN TẮC: blockchain là nguồn sự thật. Các bảng dưới đây là "bản đọc nhanh" (read model)
do Chain Watcher dựng lại từ event on-chain, cộng thêm phần metadata off-chain (mô tả, ảnh)
mà chính chủ hòm phiếu ký và ghim lên IPFS. Backend KHÔNG giữ private key nào và không
thực hiện giao dịch thay ai — mọi thao tác ghi lên chain đều do ví của chủ hòm phiếu ký.
"""
from django.db import models
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone


class Election(models.Model):
    KIND_CHOICES = [
        (0, 'Bầu chọn ứng viên'),
        (1, 'Bỏ phiếu một vấn đề'),
    ]

    contract_addr = models.CharField(max_length=42, unique=True)          # checksum address
    owner_address = models.CharField(max_length=42, db_index=True)        # ví đã tạo = chủ sở hữu
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')                # từ metadata IPFS
    kind = models.PositiveSmallIntegerField(choices=KIND_CHOICES, default=0)
    is_private = models.BooleanField(default=False)
    max_choices = models.PositiveIntegerField(default=1)
    start_time = models.DateTimeField()
    end_time = models.DateTimeField(null=True, blank=True)                # None = không hẹn giờ kết thúc
    closed_by_owner = models.BooleanField(default=False)
    metadata_uri = models.CharField(max_length=255, blank=True, default='')
    metadata_loaded = models.BooleanField(default=False)
    total_voters = models.PositiveIntegerField(default=0)
    created_block = models.PositiveBigIntegerField(default=0)
    created_tx_hash = models.CharField(max_length=66, blank=True, default='')
    is_hidden = models.BooleanField(
        default=False,
        help_text='Quản trị nền tảng ẩn khỏi danh sách/tìm kiếm (không ảnh hưởng dữ liệu on-chain).',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    synced_at = models.DateTimeField(null=True, blank=True)               # lần đối soát chain gần nhất

    class Meta:
        ordering = ['-id']
        indexes = [models.Index(fields=['is_hidden', '-id'])]

    # --- Trạng thái suy ra từ thời gian + cờ đóng sớm (luôn khớp logic status() của contract) ---
    STATUS_UPCOMING = 'upcoming'
    STATUS_OPEN = 'open'
    STATUS_ENDED = 'ended'
    STATUS_CLOSED = 'closed'   # chủ đóng sớm

    def get_status(self, now=None):
        now = now or timezone.now()
        if self.closed_by_owner:
            return self.STATUS_CLOSED
        if now < self.start_time:
            return self.STATUS_UPCOMING
        if self.end_time is not None and now >= self.end_time:
            return self.STATUS_ENDED
        return self.STATUS_OPEN

    @property
    def status(self):
        return self.get_status()

    def __str__(self):
        return f'{self.name} ({self.contract_addr[:8]}…)'


class Option(models.Model):
    """Một lựa chọn (ứng viên hoặc đáp án). Nhãn lấy từ chain; mô tả/ảnh từ metadata IPFS."""
    election = models.ForeignKey(Election, on_delete=models.CASCADE, related_name='options')
    option_id = models.PositiveIntegerField()                              # id trong contract (0..n-1)
    label = models.CharField(max_length=255)
    description = models.TextField(blank=True, default='')
    image_cid = models.CharField(max_length=100, blank=True, default='')
    vote_count = models.PositiveBigIntegerField(default=0)

    class Meta:
        ordering = ['option_id']
        constraints = [
            models.UniqueConstraint(fields=['election', 'option_id'], name='uniq_option_per_election'),
        ]

    def __str__(self):
        return f'{self.election_id}#{self.option_id} {self.label}'


class VoteRecord(models.Model):
    """Một lá phiếu (có thể gồm nhiều lựa chọn). Mỗi ví chỉ 1 phiếu/hòm phiếu (contract đảm bảo)."""
    election = models.ForeignKey(Election, on_delete=models.CASCADE, related_name='votes')
    voter_address = models.CharField(max_length=42, db_index=True)
    choices = models.JSONField(default=list)                               # [option_id, ...]
    tx_hash = models.CharField(max_length=66, db_index=True)               # luôn dạng 0x… chữ thường
    block_number = models.PositiveBigIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-block_number', '-id']
        constraints = [
            models.UniqueConstraint(fields=['election', 'voter_address'], name='uniq_vote_per_voter'),
        ]

    def __str__(self):
        return f'{self.voter_address[:8]}… -> {self.choices}'


class WhitelistEntry(models.Model):
    """Cử tri được chủ cho phép (hòm phiếu riêng tư). Đồng bộ từ event on-chain."""
    election = models.ForeignKey(Election, on_delete=models.CASCADE, related_name='whitelist')
    voter_address = models.CharField(max_length=42)
    tx_hash = models.CharField(max_length=66, blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']
        constraints = [
            models.UniqueConstraint(fields=['election', 'voter_address'], name='uniq_whitelist_entry'),
        ]

    def __str__(self):
        return f'{self.election_id}: {self.voter_address}'


class MetadataBlob(models.Model):
    """Metadata (mô tả + ảnh) mà chủ hòm phiếu đã ghim lên IPFS qua backend.
    Giữ bản sao để Watcher đọc ngay khi thấy event, không phụ thuộc gateway IPFS."""
    cid = models.CharField(max_length=100, unique=True)
    owner_address = models.CharField(max_length=42, db_index=True)
    content = models.JSONField()
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f'{self.cid} ({self.owner_address[:8]}…)'


class SystemLog(models.Model):
    LEVEL_CHOICES = [
        ('INFO', 'Thông tin'),
        ('SUCCESS', 'Thành công'),
        ('WARNING', 'Cảnh báo'),
        ('ERROR', 'Lỗi'),
    ]
    MODULE_CHOICES = [
        ('SYSTEM', 'Hệ thống'),
        ('BLOCKCHAIN', 'Blockchain'),
        ('INDEXER', 'Chain Watcher'),
        ('IPFS', 'IPFS Pinata'),
        ('AUTH', 'Xác thực'),
    ]

    timestamp = models.DateTimeField(auto_now_add=True)
    level = models.CharField(max_length=10, choices=LEVEL_CHOICES, default='INFO')
    module = models.CharField(max_length=20, choices=MODULE_CHOICES, default='SYSTEM')
    message = models.TextField()

    class Meta:
        ordering = ['-timestamp']

    def __str__(self):
        return f'[{self.get_level_display()}] {self.module}: {self.message[:50]}'


# --- Auto-rotation: giữ tối đa 1000 bản ghi SystemLog mới nhất ---
MAX_SYSTEM_LOGS = 1000


@receiver(post_save, sender=SystemLog)
def trim_system_logs(sender, instance, created, **kwargs):
    if created:
        count = SystemLog.objects.count()
        if count > MAX_SYSTEM_LOGS:
            oldest_ids = (
                SystemLog.objects.order_by('timestamp')
                .values_list('id', flat=True)[:count - MAX_SYSTEM_LOGS]
            )
            SystemLog.objects.filter(id__in=list(oldest_ids)).delete()


class IndexerState(models.Model):
    """last_block: block đã quét xong. updated_at: nhịp tim của watcher (được cập nhật
    mỗi block mới / định kỳ) — API dùng để cảnh báo khi watcher ngừng chạy."""
    key = models.CharField(max_length=50, unique=True, default='main')
    last_block = models.PositiveBigIntegerField(default=0)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'State: {self.key} - Block: {self.last_block}'
