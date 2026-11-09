# Sử dụng Python 3.11 phiên bản siêu nhẹ (slim) của Linux
FROM python:3.11-slim

# Thiết lập biến môi trường
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Cập nhật hệ điều hành và cài đặt các thư viện cần thiết cho C++ / Postgres
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        gcc \
        libpq-dev \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Chuyển thư mục làm việc vào /app
WORKDIR /app

# Copy riêng file requirements.txt vào trước (Để tận dụng tính năng Cache của Docker)
COPY requirements.txt /app/

# Cài đặt thư viện Python
RUN pip install --no-cache-dir -r requirements.txt

# Copy toàn bộ mã nguồn dự án vào trong Container
COPY . /app/
