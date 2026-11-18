"""Django Admin = bảng điều khiển của NGƯỜI VẬN HÀNH nền tảng (đăng nhập bằng tài khoản Django
thường, tạo bằng `createsuperuser`). Người vận hành KHÔNG có quyền gì trên hòm phiếu on-chain —
chỉ có thể ẩn hòm phiếu khỏi danh sách (kiểm duyệt nội dung) và xem log hệ thống.
Dữ liệu chain-derived để chỉ-đọc vì nguồn sự thật là blockchain."""
from django.contrib import admin
from django.utils.html import format_html

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
    list_display = ('name', 'contract_addr_display', 'owner_address_display', 'kind_display',
                    'is_private_display', 'status_display', 'total_voters_display', 'is_hidden', 'created_at')
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

    @admin.display(description='Hợp đồng On-Chain')
    def contract_addr_display(self, obj):
        addr = obj.contract_addr or ''
        if len(addr) >= 10:
            short = f"{addr[:6]}...{addr[-4:]}"
        else:
            short = addr or '—'
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono text-[11px] px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold border border-blue-200 shrink-0" title="{}">{}</span>',
            addr, short
        )

    @admin.display(description='Ví người tạo')
    def owner_address_display(self, obj):
        addr = obj.owner_address or ''
        if len(addr) >= 10:
            short = f"{addr[:6]}...{addr[-4:]}"
        else:
            short = addr or '—'
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200 shrink-0" title="{}">{}</span>',
            addr, short
        )

    @admin.display(description='Thể loại')
    def kind_display(self, obj):
        if obj.kind == 1:
            return format_html(
                '<span class="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-amber-50 text-amber-700 font-bold text-xs border border-amber-200 shrink-0">Lấy ý kiến</span>'
            )
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs border border-blue-200 shrink-0">Bầu cử</span>'
        )

    @admin.display(description='Quyền truy cập')
    def is_private_display(self, obj):
        if obj.is_private:
            return format_html(
                '<span class="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 font-bold text-xs border border-purple-200 shrink-0">Riêng tư (Whitelist)</span>'
            )
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-200 shrink-0">Công khai</span>'
        )

    @admin.display(description='Trạng thái')
    def status_display(self, obj):
        if obj.status == 'open':
            return format_html(
                '<span class="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">'
                '<span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>Đang mở</span>'
            )
        return format_html(
            '<span class="inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shrink-0">'
            '<span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>Đã kết thúc</span>'
        )

    @admin.display(description='Số cử tri')
    def total_voters_display(self, obj):
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono font-bold text-slate-800 text-xs shrink-0">{} cử tri</span>',
            obj.total_voters
        )

    @admin.action(description='Ẩn các hòm phiếu đã chọn khỏi danh sách')
    def hide_selected(self, request, queryset):
        self.message_user(request, f'Đã ẩn {queryset.update(is_hidden=True)} hòm phiếu.')

    @admin.action(description='Hiện lại các hòm phiếu đã chọn')
    def unhide_selected(self, request, queryset):
        self.message_user(request, f'Đã hiện {queryset.update(is_hidden=False)} hòm phiếu.')


@admin.register(VoteRecord)
class VoteRecordAdmin(ReadOnlyAdmin):
    list_display = ('election', 'voter_display', 'choices', 'tx_hash_display', 'block_number')
    search_fields = ('voter_address', 'tx_hash')

    @admin.display(description='Cử tri (Voter)')
    def voter_display(self, obj):
        addr = obj.voter_address or ''
        short = f"{addr[:6]}...{addr[-4:]}" if len(addr) >= 10 else addr
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold border border-slate-200 shrink-0" title="{}">{}</span>',
            addr, short
        )

    @admin.display(description='Giao dịch (TxHash)')
    def tx_hash_display(self, obj):
        tx = obj.tx_hash or ''
        short = f"{tx[:8]}...{tx[-6:]}" if len(tx) >= 14 else tx
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono text-[11px] px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-bold border border-indigo-200 shrink-0" title="{}">{}</span>',
            tx, short
        )


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
    list_display = ('timestamp', 'level_display', 'module_display', 'message')
    list_filter = ('level', 'module')
    search_fields = ('message',)

    @admin.display(description='Mức độ')
    def level_display(self, obj):
        colors = {
            'INFO': 'bg-blue-50 text-blue-700 border-blue-200',
            'SUCCESS': 'bg-emerald-50 text-emerald-700 border-emerald-200',
            'WARNING': 'bg-amber-50 text-amber-700 border-amber-200',
            'ERROR': 'bg-rose-50 text-rose-700 border-rose-200',
        }
        cls = colors.get(obj.level, 'bg-slate-100 text-slate-700 border-slate-200')
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap px-2 py-0.5 rounded text-[11px] font-bold border {} shrink-0">{}</span>',
            cls, obj.get_level_display()
        )

    @admin.display(description='Phân hệ')
    def module_display(self, obj):
        return format_html(
            '<span class="inline-flex items-center whitespace-nowrap font-mono text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold border border-slate-200 shrink-0">{}</span>',
            obj.get_module_display()
        )


@admin.register(IndexerState)
class IndexerStateAdmin(ReadOnlyAdmin):
    list_display = ('key', 'last_block', 'updated_at')
