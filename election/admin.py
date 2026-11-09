"""Django Admin = bảng điều khiển của NGƯỜI VẬN HÀNH nền tảng (đăng nhập bằng tài khoản Django
thường, tạo bằng `createsuperuser`). Người vận hành KHÔNG có quyền gì trên hòm phiếu on-chain —
chỉ có thể ẩn hòm phiếu khỏi danh sách (kiểm duyệt nội dung) và xem log hệ thống.
Dữ liệu chain-derived để chỉ-đọc vì nguồn sự thật là blockchain."""
from django.contrib import admin

from .models import Election, IndexerState, MetadataBlob, Option, SystemLog, VoteRecord, WhitelistEntry


class ReadOnlyAdmin(admin.ModelAdmin):
    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


class OptionInline(admin.TabularInline):
    model = Option
    extra = 0
    can_delete = False
    readonly_fields = ('option_id', 'label', 'description', 'image_cid', 'vote_count')

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(Election)
class ElectionAdmin(admin.ModelAdmin):
    list_display = ('name', 'contract_addr', 'owner_address', 'kind', 'is_private', 'status_display',
                    'total_voters', 'is_hidden', 'created_at')
    list_filter = ('is_hidden', 'kind', 'is_private', 'closed_by_owner')
    search_fields = ('name', 'contract_addr', 'owner_address')
    list_editable = ('is_hidden',)
    actions = ['hide_selected', 'unhide_selected']
    inlines = [OptionInline]

    # Chỉ cho sửa cờ ẩn; mọi trường khác là dữ liệu chain-derived
    def get_readonly_fields(self, request, obj=None):
        return [f.name for f in self.model._meta.fields if f.name != 'is_hidden']

    def has_add_permission(self, request):
        return False

    @admin.display(description='Trạng thái')
    def status_display(self, obj):
        return obj.status

    @admin.action(description='Ẩn các hòm phiếu đã chọn khỏi danh sách')
    def hide_selected(self, request, queryset):
        self.message_user(request, f'Đã ẩn {queryset.update(is_hidden=True)} hòm phiếu.')

    @admin.action(description='Hiện lại các hòm phiếu đã chọn')
    def unhide_selected(self, request, queryset):
        self.message_user(request, f'Đã hiện {queryset.update(is_hidden=False)} hòm phiếu.')


@admin.register(VoteRecord)
class VoteRecordAdmin(ReadOnlyAdmin):
    list_display = ('election', 'voter_address', 'choices', 'tx_hash', 'block_number')
    search_fields = ('voter_address', 'tx_hash')


@admin.register(WhitelistEntry)
class WhitelistEntryAdmin(ReadOnlyAdmin):
    list_display = ('election', 'voter_address', 'created_at')
    search_fields = ('voter_address',)


@admin.register(MetadataBlob)
class MetadataBlobAdmin(ReadOnlyAdmin):
    list_display = ('cid', 'owner_address', 'created_at')
    search_fields = ('cid', 'owner_address')


@admin.register(SystemLog)
class SystemLogAdmin(ReadOnlyAdmin):
    list_display = ('timestamp', 'level', 'module', 'message')
    list_filter = ('level', 'module')
    search_fields = ('message',)


@admin.register(IndexerState)
class IndexerStateAdmin(ReadOnlyAdmin):
    list_display = ('key', 'last_block', 'updated_at')
