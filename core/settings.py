"""
Django settings for core project.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent.parent


# Security

DEBUG = os.environ.get('DEBUG', 'False').strip().lower() in ('true', '1', 'yes')

SECRET_KEY = os.environ.get('DJANGO_SECRET_KEY')
if not SECRET_KEY:
    if DEBUG:
        SECRET_KEY = 'django-insecure-dev-only-key-do-not-use-in-production'
    else:
        from django.core.exceptions import ImproperlyConfigured
        raise ImproperlyConfigured('Thiếu DJANGO_SECRET_KEY (bắt buộc khi DEBUG=False).')


def _csv_env(name, default=''):
    return [x.strip() for x in os.environ.get(name, default).split(',') if x.strip()]


ALLOWED_HOSTS = ['127.0.0.1', 'localhost'] + _csv_env('ALLOWED_HOSTS')
CSRF_TRUSTED_ORIGINS = _csv_env('CSRF_TRUSTED_ORIGINS')

# Số proxy đứng trước ứng dụng — dùng để lấy IP thật cho rate limit (local = 0)
TRUSTED_PROXY_COUNT = int(os.environ.get('TRUSTED_PROXY_COUNT', 0))

if not DEBUG:
    SECURE_SSL_REDIRECT = True
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = 31536000
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')


# Apps & Middleware

INSTALLED_APPS = [
    'daphne',
    'jazzmin',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'election',
    'channels',
]

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'whitenoise.middleware.WhiteNoiseMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'core.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [BASE_DIR / 'templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

ASGI_APPLICATION = 'core.asgi.application'


# Database

USE_SQLITE = os.environ.get('USE_SQLITE', 'False').strip().lower() in ('true', '1', 'yes')

if USE_SQLITE:
    DATABASES = {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': BASE_DIR / 'db.sqlite3',
        }
    }
else:
    import dj_database_url
    DATABASES = {
        'default': dj_database_url.config(
            default=os.environ.get('DATABASE_URL'),
            conn_max_age=0,
            conn_health_checks=True,
        )
    }
    DATABASES['default']['DISABLE_SERVER_SIDE_CURSORS'] = True

SESSION_ENGINE = 'django.contrib.sessions.backends.signed_cookies'
SESSION_COOKIE_AGE = int(os.environ.get('SESSION_COOKIE_AGE', 86400))


# Redis / Channel Layer / Cache

REDIS_URL = os.environ.get('REDIS_URL')

if REDIS_URL:
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels_redis.pubsub.RedisPubSubChannelLayer',
            'CONFIG': {
                'hosts': [REDIS_URL],
                'prefix': 'blockchain_voting:',
            },
        }
    }
    # Rate-limiter dùng Redis để đồng bộ giữa các tiến trình
    CACHES = {
        'default': {
            'BACKEND': 'django.core.cache.backends.redis.RedisCache',
            'LOCATION': REDIS_URL,
        }
    }
else:
    # Không có Redis: dùng bộ nhớ nội bộ, trang tự refresh mỗi 60 giây
    CHANNEL_LAYERS = {
        'default': {
            'BACKEND': 'channels.layers.InMemoryChannelLayer',
        }
    }


# Blockchain

CHAIN_ID       = int(os.environ.get('CHAIN_ID', 11155111))   # 11155111 = Sepolia, 31337 = Hardhat
CHAIN_NAME     = os.environ.get('CHAIN_NAME', 'Sepolia')
CHAIN_RPC_PUBLIC = os.environ.get('CHAIN_RPC_PUBLIC', 'https://ethereum-sepolia-rpc.publicnode.com')
EXPLORER_URL   = os.environ.get('EXPLORER_URL', 'https://sepolia.etherscan.io').rstrip('/')
IPFS_GATEWAY   = os.environ.get('IPFS_GATEWAY', 'https://gateway.pinata.cloud/ipfs').rstrip('/')
CURRENCY_SYMBOL = os.environ.get('CURRENCY_SYMBOL', 'ETH')

# Giới hạn chống lạm dụng upload
MAX_IMAGE_BYTES         = int(os.environ.get('MAX_IMAGE_BYTES', 2 * 1024 * 1024))  # 2 MB
MAX_METADATA_BYTES      = 32 * 1024                                                 # 32 KB
UPLOADS_PER_HOUR        = int(os.environ.get('UPLOADS_PER_HOUR', 40))
DATA_UPLOAD_MAX_MEMORY_SIZE = 3 * 1024 * 1024

# Chain Watcher
GETLOGS_BLOCK_RANGE  = int(os.environ.get('GETLOGS_BLOCK_RANGE', 2000))
SCAN_SLEEP           = float(os.environ.get('SCAN_SLEEP', 0.5))
INDEXER_STALE_SECONDS = int(os.environ.get('INDEXER_STALE_SECONDS', 120))


# Password validation

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]


# Internationalisation

LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_I18N      = True
USE_TZ        = True


# Static files

STATIC_URL       = '/static/'
STATICFILES_DIRS = [BASE_DIR / 'static']
STATIC_ROOT      = BASE_DIR / 'staticfiles'

DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'


# Jazzmin (Admin UI)

JAZZMIN_SETTINGS = {
    'site_title':   'Web3 Voting Admin',
    'site_header':  'Nền tảng Hòm phiếu Cộng đồng',
    'site_brand':   'Quản trị nền tảng',
    'welcome_sign': 'Chào mừng đến với Bảng điều khiển Web3',
    'copyright':    '2026 Web3 Voting Project',
    'show_ui_builder': False,
    'topmenu_links': [
        {'name': 'Trang Chủ',      'url': 'admin:index',       'permissions': ['auth.view_user']},
        {'name': 'Vào Web Bầu Cử', 'url': '/', 'new_window': True},
    ],
    'icons': {
        'auth':                    'fas fa-users-cog',
        'auth.user':               'fas fa-user',
        'auth.Group':              'fas fa-users',
        'election.Election':       'fas fa-box-open',
        'election.Option':         'fas fa-list-ol',
        'election.VoteRecord':     'fas fa-vote-yea',
        'election.WhitelistEntry': 'fas fa-id-card',
        'election.MetadataBlob':   'fas fa-file-code',
        'election.SystemLog':      'fas fa-terminal',
        'election.IndexerState':   'fas fa-heartbeat',
    },
    'default_icon_parents':  'fas fa-chevron-circle-right',
    'default_icon_children': 'fas fa-circle',
    'related_modal_active':  True,
    'custom_css': None,
    'custom_js':  None,
}

JAZZMIN_UI_TWEAKS = {
    'theme':              'darkly',
    'default_theme_mode': 'dark',
}
