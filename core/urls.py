from django.contrib import admin
from django.urls import path, re_path
from django.views.generic import TemplateView

from election import views

ADDR = r'(?P<address>0x[0-9a-fA-F]{40})'

urlpatterns = [
    path('admin/', admin.site.urls),

    # --- Trang HTML (frontend gọi API bên dưới) ---
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('create/', TemplateView.as_view(template_name='create.html'), name='create'),
    path('my/', TemplateView.as_view(template_name='my.html'), name='my'),
    path('verify/', TemplateView.as_view(template_name='verify.html'), name='verify'),
    re_path(rf'^election/{ADDR}/$', TemplateView.as_view(template_name='detail.html'), name='detail'),

    # --- API: cấu hình & sức khoẻ ---
    path('api/config/', views.config),
    path('api/health/', views.health),

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
