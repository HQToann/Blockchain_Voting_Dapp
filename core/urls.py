from django.contrib import admin
from django.contrib.auth import logout
from django.shortcuts import redirect
from django.urls import path, re_path
from django.views.generic import TemplateView

from election import views

# Thiết lập thương hiệu cho trang Quản trị Admin
admin.site.site_header = "VoteChain • Hệ Thống Quản Trị On-Chain"
admin.site.site_title = "VoteChain Admin Portal"
admin.site.index_title = "Bảng Điều Khiển Nền Tảng Bầu Cử"

# Tùy biến hàm đăng xuất: Đăng xuất và chuyển thẳng về trang đăng nhập admin
def custom_admin_logout(request):
    logout(request)
    return redirect('/admin/login/')

admin.site.logout = custom_admin_logout

ADDR = r'(?P<address>0x[0-9a-fA-F]{40})'

urlpatterns = [
    # Đăng xuất admin chuyển thẳng về trang login
    path('admin/logout/', custom_admin_logout, name='admin_logout'),
    path('admin/', admin.site.urls),

    # --- Trang HTML (frontend gọi API bên dưới) ---
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('create/', TemplateView.as_view(template_name='create.html'), name='create'),
    path('my/', TemplateView.as_view(template_name='my.html'), name='my'),
    path('verify/', TemplateView.as_view(template_name='verify.html'), name='verify'),
    re_path(rf'^election/{ADDR}/$', TemplateView.as_view(template_name='detail.html'), name='detail'),

    # --- API: cấu hình & sức khoẻ & thống kê ---
    path('api/config/', views.config),
    path('api/health/', views.health),
    path('api/stats/', views.platform_stats),

    # --- API: đăng nhập ví (chỉ để upload IPFS) ---
    path('api/auth/nonce/', views.auth_nonce),
    path('api/auth/verify/', views.auth_verify),
    path('api/auth/me/', views.auth_me),
    path('api/auth/logout/', views.auth_logout),

    # --- API: hòm phiếu (chỉ đọc) ---
    path('api/elections/', views.elections_list),
    re_path(rf'^api/elections/{ADDR}/$', views.election_detail),
    re_path(rf'^api/elections/{ADDR}/voters/$', views.election_voters),
    re_path(rf'^api/elections/{ADDR}/whitelist/$', views.election_whitelist),
    path('api/verify/', views.verify_tx),

    # --- API: IPFS (cần đăng nhập ví) ---
    path('api/ipfs/image/', views.upload_image),
    path('api/ipfs/metadata/', views.upload_metadata),
]
