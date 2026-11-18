/**
 * Thư viện Giao diện Thẻ & Phân trang dùng chung (VoteChain UI Cards)
 * Chuẩn hóa thiết kế Material 3 & Tailwind CSS
 */
var ElectionCards = window.ElectionCards = (function () {
  'use strict';
  // Safe helper fallbacks in case App is not fully initialized
  const esc = (s) => (window.App && typeof window.App.esc === 'function')
    ? window.App.esc(s)
    : String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const short = (a) => (window.App && typeof window.App.short === 'function')
    ? window.App.short(a)
    : (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');

  const fmtDate = (iso) => (window.App && typeof window.App.fmtDate === 'function')
    ? window.App.fmtDate(iso)
    : (iso ? new Date(iso).toLocaleString('vi-VN') : '—');

  const fmtDuration = (ms) => {
    if (window.App && typeof window.App.fmtDuration === 'function') return window.App.fmtDuration(ms);
    if (!ms || ms <= 0) return '0 giây';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s % 60} giây` : `${s} giây`;
  };

  const sameAddr = (a, b) => (window.App && typeof window.App.sameAddr === 'function')
    ? window.App.sameAddr(a, b)
    : (!!a && !!b && a.toLowerCase() === b.toLowerCase());

  // 1. Thẻ Hòm Phiếu Khám Phá & Quản Lý (Dùng trên trang Chủ / Khám Phá & Hòm Phiếu Của Tôi)
    // 1. Thẻ Hòm Phiếu Khám Phá & Quản Lý (Tối ưu theo Phương án B: Cân bằng thông tin, Tinh giản & Hiện đại)
  function card(e, me, isVotedTab) {
    const isOwner = me && sameAddr(me, e.owner);
    const isProp = e.kind === 1;
    const rule = e.max_choices > 1 ? `chọn 1-${e.max_choices}` : 'chọn 1';
    const pollId = `#${e.address.slice(2, 6).toUpperCase()}-${e.address.slice(-4).toUpperCase()}`;

    let statusHtml = '';
    if (e.status === 'open') {
      let openText = 'Đang mở';
      let titleAttr = 'Hòm phiếu mở không giới hạn thời gian (Đóng thủ công)';
      if (e.end_time) {
        const diff = Date.parse(e.end_time) - Date.now();
        if (diff > 0) {
          const s = Math.floor(diff / 1000);
          const d = Math.floor(s / 86400);
          const h = Math.floor((s % 86400) / 3600);
          const m = Math.floor((s % 3600) / 60);
          let remStr = d > 0 ? `${d} ngày` : (h > 0 ? `${h} giờ` : (m > 0 ? `${m}p` : `${s}s`));
          openText = `Còn ${remStr}`;
          titleAttr = `Hẹn giờ kết thúc: ${fmtDate(e.end_time)}`;
        } else {
          openText = 'Sắp đóng';
          titleAttr = `Đã đến hạn kết thúc: ${fmtDate(e.end_time)}`;
        }
      }
      statusHtml = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold text-xs whitespace-nowrap shrink-0 border border-emerald-200/80" title="${esc(titleAttr)}">
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>${esc(openText)}</span>
        </span>
      `;
    } else if (e.status === 'upcoming') {
      statusHtml = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 font-semibold text-xs whitespace-nowrap shrink-0 border border-amber-200/80">
          <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          <span>Sắp diễn ra</span>
        </span>
      `;
    } else {
      statusHtml = `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-slate-600 font-medium text-xs whitespace-nowrap shrink-0 border border-slate-200/80">
          <span class="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
          <span>Đã kết thúc</span>
        </span>
      `;
    }

    let extraBadges = '';
    if (e.is_private) {
      extraBadges += `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[11px] font-semibold border border-purple-200">Riêng tư</span>`;
    }
    if (isOwner) {
      extraBadges += `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200">Của bạn</span>`;
    }
    if (isVotedTab) {
      extraBadges += `<span class="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-semibold border border-emerald-200">Đã bỏ phiếu</span>`;
    }

    let actionBtn = '';
    if (e.status === 'open') {
      const btnLabel = isOwner ? 'Vào hòm phiếu' : (isProp ? 'Biểu quyết ngay' : 'Bỏ phiếu ngay');
      actionBtn = `
        <a class="btn-card-action w-full py-2.5 rounded-xl bg-blue-600 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all text-decoration-none shadow-sm" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px]">how_to_vote</span>
          <span>${btnLabel}</span>
        </a>
      `;
    } else if (e.status === 'upcoming') {
      actionBtn = `
        <a class="btn-card-action w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs sm:text-sm border border-slate-200/90 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-decoration-none" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-blue-600">schedule</span>
          <span>Xem chi tiết</span>
        </a>
      `;
    } else {
      actionBtn = `
        <a class="btn-card-action w-full py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 font-semibold text-xs sm:text-sm border border-slate-200/90 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center justify-center gap-2 text-decoration-none" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-blue-600">query_stats</span>
          <span>Xem kết quả</span>
        </a>
      `;
    }

    const votersCount = e.total_voters || 0;
    const optsCount = e.option_count || 0;
    
    return `
      <div class="rounded-2xl bg-white p-5 shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-4 border border-slate-200/90 h-full">
        <div class="space-y-3">
          <!-- Hàng 1: Thể loại + Trạng thái trên cùng một hàng gọn gàng -->
          <div class="flex items-center justify-between gap-2 min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap min-w-0">
              <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg ${isProp ? 'bg-sky-50 text-blue-700 border border-blue-200/80' : 'bg-blue-50 text-blue-700 border border-blue-200/80'} font-bold text-xs">
                <span class="material-symbols-outlined text-[15px]">${isProp ? 'poll' : 'how_to_vote'}</span>
                <span>${isProp ? 'Biểu quyết' : 'Bầu cử'}</span>
              </span>
              ${extraBadges}
            </div>
            ${statusHtml}
          </div>

          <!-- Hàng 2: Tiêu đề hòm phiếu làm trung tâm, thoáng đãng -->
          <div>
            <h4 class="font-bold text-slate-900 text-base sm:text-lg line-clamp-2 hover:text-blue-600 transition-colors leading-snug">
              <a href="/election/${esc(e.address)}/" class="text-slate-900 hover:text-blue-600 transition-colors text-decoration-none" title="${esc(e.name)}">${esc(e.name)}</a>
            </h4>
          </div>

          <!-- Hàng 3: Cụm chỉ số tinh giản (Pill Tags) thay cho các câu chữ dài dòng -->
          <div class="flex flex-wrap items-center gap-2 pt-0.5">
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium">
              <span class="material-symbols-outlined text-[15px] text-blue-600">group</span>
              <span><b>${votersCount}</b> cử tri</span>
            </span>
            <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium">
              <span class="material-symbols-outlined text-[15px] text-slate-500">${isProp ? 'format_list_bulleted' : 'person'}</span>
              <span><b>${optsCount}</b> ${isProp ? 'phương án' : 'ứng viên'} (${rule})</span>
            </span>
          </div>

          <!-- Hàng 4: Thanh tiến trình siêu mảnh tinh tế -->
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
            <div class="h-full bg-blue-600 rounded-full transition-all duration-500" style="width: ${votersCount > 0 ? Math.min(100, Math.max(12, votersCount * 8)) : 0}%"></div>
          </div>

          <!-- Hàng 5: Thông tin người tạo và mã băm kín đáo (Phương án B) -->
          <div class="flex items-center justify-between text-[11px] text-slate-400 pt-0.5 font-mono">
            <span class="truncate max-w-[160px]">Ví tạo: <span class="text-slate-600 font-semibold">${esc(short(e.owner))}</span></span>
            <span class="shrink-0 text-slate-400">${pollId}</span>
          </div>
        </div>

        <!-- Hàng 6: Nút hành động kêu gọi trực quan -->
        <div class="pt-3 border-t border-slate-100">
          ${actionBtn}
        </div>
      </div>
    `;
  }

  // 2. Thẻ Hòm Phiếu Cá Nhân (Hỗ trợ gọi từ myCard)
  function myCard(e, me, isVotedTab) {
    return card(e, me, isVotedTab);
  }

  // 2. Thẻ Hòm Phiếu Cá Nhân (Dùng trên trang Hòm Phiếu Của Tôi)
  function myCard(e, me, isVotedTab) {
    const explorerUrl = (window.App && window.App.cfg && window.App.cfg.explorer_url) || 'https://sepolia.etherscan.io';
    const isOwner = me && sameAddr(me, e.owner);
    let statusBadge = '';
    let timeLabel = '';
    if (e.status === 'open') {
      const remaining = e.end_time ? fmtDuration(Date.parse(e.end_time) - Date.now()) : null;
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-label-tag text-label-tag font-bold tracking-wide">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          ĐANG MỞ
        </span>
      `;
      timeLabel = remaining ? `
        <div class="flex items-center gap-1.5 text-error font-medium">
          <span class="material-symbols-outlined text-[18px]">alarm</span>
          <span>Kết thúc: ${esc(fmtDate(e.end_time))}</span>
          <span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-tag text-label-tag font-bold">Còn ${esc(remaining)}</span>
        </div>
      ` : `
        <div class="flex items-center gap-1.5 text-on-surface-variant font-medium">
          <span class="material-symbols-outlined text-[18px] text-tertiary">all_inclusive</span>
          <span>Không hẹn giờ (Chủ hòm phiếu đóng thủ công)</span>
        </div>
      `;
    } else if (e.status === 'upcoming') {
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 text-amber-800 font-label-tag text-label-tag font-bold">
          <span class="material-symbols-outlined text-[14px]">schedule</span>
          SẮP DIỄN RA
        </span>
      `;
      timeLabel = `
        <div class="flex items-center gap-1.5 text-amber-700 font-medium">
          <span class="material-symbols-outlined text-[18px]">schedule</span>
          <span>Bắt đầu lúc: ${esc(fmtDate(e.start_time))}</span>
        </div>
      `;
    } else {
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-tag text-label-tag font-bold">
          <span class="material-symbols-outlined text-[14px]">lock</span>
          ĐÃ KẾT THÚC
        </span>
      `;
      timeLabel = `
        <div class="flex items-center gap-1.5 text-on-surface-variant font-medium">
          <span class="material-symbols-outlined text-[18px] text-tertiary">task_alt</span>
          <span>Đã kết thúc vào: ${esc(fmtDate(e.end_time || e.created_at))}</span>
        </div>
      `;
    }

    const kindBadge = `
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-high text-on-surface font-label-tag text-label-tag font-semibold">
        <span class="material-symbols-outlined text-[14px] text-primary">${e.kind === 1 ? 'poll' : 'how_to_vote'}</span>
        ${e.kind === 1 ? 'Lấy ý kiến' : 'Bầu ứng viên'}
      </span>
    `;

    const roleBadge = isOwner ? `
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary-fixed text-on-primary-fixed-variant font-label-tag text-label-tag font-bold">
        <span class="material-symbols-outlined text-[14px]">shield_person</span>
        Của bạn (Quản trị viên)
      </span>
    ` : (isVotedTab ? `
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-label-tag text-label-tag font-bold">
        <span class="material-symbols-outlined text-[14px]">how_to_reg</span>
        Đã bỏ phiếu
      </span>
    ` : '');

    let ctaBtn = '';
    if (e.status === 'open') {
      ctaBtn = `
        <a class="btn-card-action px-space-md py-2.5 rounded-xl bg-primary text-white font-headline-sm text-sm font-bold shadow hover:bg-blue-700 hover:shadow-md hover:shadow-blue-500/20 hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 text-decoration-none" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px]">how_to_vote</span>
          <span>${isOwner ? 'Vào hòm phiếu' : 'Bỏ phiếu ngay'}</span>
        </a>
      `;
    } else {
      ctaBtn = `
        <a class="btn-card-action px-space-md py-2.5 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-sm font-semibold border border-slate-200 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 transition-all flex items-center gap-2 text-decoration-none" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-primary">insights</span>
          <span>Xem kết quả</span>
        </a>
      `;
    }

    const votersCount = e.total_voters || 0;
    const ruleText = e.max_choices > 1 ? `Chọn từ 1 đến ${e.max_choices} lựa chọn` : 'Chọn đúng 1 lựa chọn';

    return `
      <div class="group relative overflow-hidden rounded-2xl bg-surface-container-lowest p-space-md md:p-space-lg shadow-sm hover:shadow-lg transition-all duration-300 border border-slate-200">
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-container via-secondary-container to-tertiary-container"></div>
        <div class="flex flex-col gap-space-md">
          <div class="flex flex-wrap items-center justify-between gap-space-sm">
            <div class="flex flex-wrap items-center gap-2">
              ${statusBadge}
              ${kindBadge}
              ${roleBadge}
              ${e.is_private ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-label-tag text-label-tag font-semibold border border-purple-200"><span class="material-symbols-outlined text-[12px]">lock</span> Riêng tư</span>' : ''}
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-50 text-slate-600 font-label-code text-xs border border-slate-200/80">
              <span class="material-symbols-outlined text-[16px] text-outline">token</span>
              <span>Contract:</span>
              <span class="text-on-surface font-semibold">${short(e.address)}</span>
              <button type="button" class="btn-copy hover:text-primary transition-colors ml-1 p-0.5 cursor-pointer" data-copy="${esc(e.address)}" title="Sao chép Contract Address">
                <span class="material-symbols-outlined text-[16px]">content_copy</span>
              </button>
            </div>
          </div>

          <div class="flex flex-col md:flex-row md:items-start justify-between gap-space-sm">
            <div class="max-w-3xl">
              <h2 class="font-headline-lg text-headline-lg font-bold text-on-surface hover:text-primary transition-colors cursor-pointer leading-tight">
                <a href="/election/${esc(e.address)}/">${esc(e.name)}</a>
              </h2>
              <div class="mt-2 flex flex-wrap items-center gap-y-2 gap-x-4 font-body-sm text-body-sm text-on-surface-variant">
                ${timeLabel}
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px] text-outline">group</span>
                  <span><b>${votersCount}</b> cử tri đã bỏ phiếu</span>
                </div>
                <div class="flex items-center gap-1.5">
                  <span class="material-symbols-outlined text-[18px] text-outline">fact_check</span>
                  <span>${ruleText}</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-space-xs shrink-0 self-start">
              ${ctaBtn}
            </div>
          </div>

          <div class="rounded-xl bg-surface-container-low p-space-md flex flex-col gap-space-sm border border-surface-container-high/40">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <span class="font-headline-sm text-body-md font-bold text-on-surface">Tiến độ cử tri</span>
                <span class="px-2 py-0.5 rounded-full bg-tertiary-container text-on-tertiary font-label-code text-label-tag font-bold">
                  ${votersCount > 0 ? `${votersCount} phiếu ghi nhận` : 'Chưa có phiếu'}
                </span>
              </div>
              <span class="font-label-code text-body-sm text-on-surface-variant">${e.option_count || 0} lựa chọn</span>
            </div>
            <div class="w-full bg-surface-container-high h-2.5 rounded-full overflow-hidden">
              <div class="h-full bg-gradient-to-r from-primary-container via-secondary-container to-tertiary-container rounded-full transition-all duration-500" style="width: ${votersCount > 0 ? Math.min(100, Math.max(12, votersCount * 8)) : 0}%"></div>
            </div>
          </div>

          <div class="pt-3 sm:pt-3.5 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100">
            <div class="flex flex-wrap items-center gap-2">
              <a class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50/80 hover:bg-blue-100/80 text-primary hover:text-blue-700 text-xs font-semibold border border-blue-200/60 transition-all hover:shadow-xs hover:-translate-y-0.5 text-decoration-none" href="/election/${esc(e.address)}/">
                <span class="material-symbols-outlined text-[16px] text-primary">${isOwner ? 'tune' : 'visibility'}</span>
                <span>${isOwner ? 'Chi tiết &amp; Quản lý' : 'Xem chi tiết'}</span>
              </a>
              <button type="button" class="btn-share inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" data-url="${window.location.origin}/election/${esc(e.address)}/">
                <span class="material-symbols-outlined text-[16px] text-slate-500">share</span>
                <span class="btn-share-label">Chia sẻ link</span>
              </button>
              <a class="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-medium border border-slate-200/90 shadow-2xs hover:border-slate-300 hover:shadow-xs hover:-translate-y-0.5 active:translate-y-0 transition-all text-decoration-none" href="${explorerUrl}/address/${esc(e.address)}" target="_blank" rel="noopener noreferrer">
                <span class="material-symbols-outlined text-[16px] text-slate-500">open_in_new</span>
                <span>Xem trên Etherscan</span>
              </a>
            </div>
            <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/60 font-label-tag text-[11px] font-semibold">
              <span class="material-symbols-outlined text-[14px] text-emerald-600">verified</span>
              <span>On-Chain Verified</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Thẻ Ứng Viên / Lựa Chọn Bỏ Phiếu (Dùng trên trang Chi Tiết)
  function candidateCard(o, ctx) {
    const { isLeader, sel, canPick, full, noun, kind, myVoted, hasVoted, isEnded, contractAddress } = ctx;
    const initial = esc(o.label.charAt(0).toUpperCase());
    const leaderLabel = isEnded ? 'Đắc cử' : 'Đang dẫn đầu';

    // Xác định giao diện thẻ: Nếu là người cử tri đã vote thì làm NỔI BẬT hoàn toàn
    let cardClasses = 'candidate-card rounded-2xl p-space-lg transition-all duration-300 relative ';
    if (myVoted) {
      cardClasses += 'bg-gradient-to-br from-emerald-50 via-white to-teal-50/40 border-2 border-emerald-500 shadow-xl shadow-emerald-500/10 ring-4 ring-emerald-500/20 cursor-default';
    } else if (hasVoted) {
      cardClasses += 'bg-slate-50/50 border border-slate-200/60 shadow-none opacity-55 hover:opacity-80 cursor-default grayscale-[15%]';
    } else if (sel) {
      cardClasses += 'bg-primary-container/[0.02] border-primary-container/40 ring-2 ring-primary-container shadow-md cursor-pointer';
    } else {
      cardClasses += 'bg-surface-container-lowest border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-300 ' + (canPick && !full ? 'cursor-pointer' : (full ? 'opacity-60 cursor-default' : 'cursor-default'));
    }

    return `
      <div class="${cardClasses}" data-candidate-id="${o.id}" data-candidate-name="${esc(o.label)}">
        <!-- Huy hiệu góc trên bên phải -->
        <div class="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 flex items-center gap-1.5 z-10 flex-wrap justify-end">
          ${myVoted ? `
            <span class="px-3.5 py-1.5 rounded-full bg-emerald-600 text-white font-label-tag text-xs font-black flex items-center gap-1.5 shadow-md ring-2 ring-emerald-200">
              <span class="material-symbols-outlined text-[16px]">how_to_reg</span> LÁ PHIẾU CỦA BẠN
            </span>
          ` : ''}
          ${isLeader ? `
            <span class="px-2.5 py-1 rounded-full ${myVoted ? 'bg-emerald-700/90 text-white' : (isEnded ? 'bg-amber-500 text-white shadow-amber-500/20' : 'bg-primary-container text-on-primary')} font-label-tag text-[11px] font-bold flex items-center gap-1 shadow-sm">
              <span class="material-symbols-outlined text-[14px]">${isEnded ? 'emoji_events' : 'stars'}</span> ${leaderLabel}
            </span>
          ` : ''}
        </div>

        <div class="flex flex-col sm:flex-row items-start gap-space-lg">
          <div class="relative shrink-0">
            ${o.image_url ? `
              <img class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-sm bg-surface-container border ${myVoted ? 'border-2 border-emerald-500 ring-4 ring-emerald-500/25 shadow-md' : 'border-surface-container-high/60'}" src="${esc(o.image_url)}" alt="${esc(o.label)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary font-bold text-3xl shadow-sm border border-surface-container-high\\'>${initial}</div>';">
            ` : `
              <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl ${myVoted ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-500 ring-4 ring-emerald-500/25 shadow-md' : 'bg-surface-container-high text-primary border border-surface-container-high'} flex items-center justify-center font-bold text-3xl shadow-sm">
                ${initial}
              </div>
            `}
            ${myVoted ? `
              <div class="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-md ring-2 ring-white" title="Lá phiếu bạn đã chọn">
                <span class="material-symbols-outlined text-[18px]">verified</span>
              </div>
            ` : (isLeader ? `
              <div class="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-md">
                <span class="material-symbols-outlined text-[18px]">verified</span>
              </div>
            ` : '')}
          </div>

          <div class="flex-1 flex flex-col gap-space-sm min-w-0 w-full">
            <div class="flex flex-col">
              <span class="font-label-code text-label-code ${myVoted ? 'text-emerald-700 font-extrabold' : (sel || isLeader ? 'text-primary font-bold' : 'text-outline font-semibold')}">
                #${noun} ${String(o.id + 1).padStart(2, '0')} ${myVoted ? '• (Đã được bạn chọn)' : ''}
              </span>
              <h3 class="font-headline-lg text-headline-lg ${myVoted ? 'text-emerald-950 font-black' : 'text-on-surface font-bold'} leading-tight flex items-center gap-2">
                <span>${esc(o.label)}</span>
                ${myVoted ? '<span class="material-symbols-outlined text-emerald-600 text-[24px]">verified</span>' : ''}
              </h3>
            </div>

            ${o.description ? `
              <div class="${myVoted ? 'bg-emerald-50/80 border-emerald-200/90' : 'bg-surface-container-low border-surface-container-high/40'} p-space-md rounded-xl flex flex-col gap-1 border">
                <div class="flex items-center gap-1 ${myVoted ? 'text-emerald-700' : (isLeader ? 'text-primary' : 'text-secondary')} font-headline-sm text-body-md font-bold">
                  <span class="material-symbols-outlined text-[18px]">flag</span>
                  ${kind === 1 ? 'Nội dung chi tiết' : 'Mô tả'}
                </div>
                <p class="font-body-md text-body-md ${myVoted ? 'text-emerald-950 font-medium' : 'text-on-surface-variant'} leading-relaxed whitespace-pre-wrap">
                  ${esc(o.description)}
                </p>
              </div>
            ` : ''}

            <div class="flex flex-col gap-space-xs pt-space-xs">
              <div class="flex justify-between items-center font-headline-sm text-body-md">
                <span class="${myVoted ? 'text-emerald-950 font-bold' : 'text-on-surface font-semibold'} flex items-center gap-1">
                  <span class="material-symbols-outlined ${myVoted ? 'text-emerald-600' : 'text-primary'} text-[18px]">how_to_vote</span>
                  Số phiếu ủng hộ: <strong class="${myVoted ? 'text-emerald-700 font-black' : 'text-primary font-bold'} ml-1">${o.votes} phiếu</strong>
                </span>
                <span class="font-label-code text-label-code ${myVoted ? 'text-emerald-700 font-black text-sm' : 'text-primary font-bold'}">${o.percent}%</span>
              </div>
              <div class="w-full h-3 rounded-full ${myVoted ? 'bg-emerald-100' : 'bg-surface-container-high'} overflow-hidden">
                <div class="h-full ${myVoted ? 'bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600' : (isLeader ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-primary-container')} rounded-full transition-all duration-500" style="width: ${Math.min(100, o.percent)}%"></div>
              </div>
            </div>

            <div class="pt-space-sm flex items-center justify-between gap-space-md flex-wrap border-t ${myVoted ? 'border-emerald-200/60' : 'border-surface-container/60'}">
              ${canPick ? `
                <button class="candidate-select-btn w-full sm:w-auto px-space-lg py-space-sm rounded-xl font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-space-xs transition-all shadow-sm ${sel ? 'bg-primary text-white hover:bg-blue-700 hover:shadow-md hover:-translate-y-0.5' : 'bg-surface-container-high text-on-surface hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-slate-200/80 hover:shadow-sm hover:-translate-y-0.5 cursor-pointer'}" type="button">
                  <span class="material-symbols-outlined text-[20px]">${sel ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                  ${sel ? (kind === 1 ? 'Đã chọn phương án này' : 'Đã chọn ứng viên này') : (kind === 1 ? 'Chọn phương án này' : 'Chọn ứng viên')}
                </button>
              ` : (myVoted ? `
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white font-headline-sm text-xs sm:text-sm font-bold shadow-md shadow-emerald-600/20 ring-2 ring-emerald-300">
                  <span class="material-symbols-outlined text-white text-[18px]">how_to_reg</span>
                  <span>${kind === 1 ? 'Bạn đã biểu quyết cho phương án này' : 'Bạn đã bỏ phiếu cho ứng viên này'}</span>
                </div>
              ` : `
                <span class="font-body-sm text-xs text-outline flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-surface-container-low border border-surface-container-high/40">
                  <span class="material-symbols-outlined text-[16px] text-slate-400">block</span>
                  <span>${hasVoted ? 'Không được bạn lựa chọn' : 'Không thể bình chọn'}</span>
                </span>
              `)}

              <a class="${myVoted ? 'text-emerald-700 hover:text-emerald-800' : 'text-primary hover:text-blue-700'} font-body-sm text-body-sm font-semibold flex items-center gap-1 hover:underline ml-auto" href="https://sepolia.etherscan.io/address/${esc(contractAddress)}" target="_blank" rel="noopener">
                Xem Smart Contract
                <span class="material-symbols-outlined text-[16px]">arrow_forward</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Render bảng danh sách Cử tri đã bỏ phiếu (Detail Page Tab)
  function votersTable(votes) {
    if (!votes || !votes.length) {
      return `
        <div class="text-center py-12 text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-outline text-[42px]">inbox</span>
          <p class="font-headline-sm font-semibold">Chưa có cử tri nào bỏ phiếu.</p>
        </div>
      `;
    }
    return `
      <div class="overflow-x-auto rounded-xl border border-surface-container-high/60">
        <table class="w-full text-left font-body-sm">
          <thead class="bg-surface-container-low text-on-surface-variant font-semibold border-b border-surface-container-high">
            <tr>
              <th class="p-3">Ví cử tri</th>
              <th class="p-3">Đã chọn</th>
              <th class="p-3">Thời gian</th>
              <th class="p-3 text-right">Mã giao dịch (TxHash)</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-high">
            ${votes.map((v) => `
              <tr class="hover:bg-surface-container-low/50 transition-colors">
                <td class="p-3 font-label-code">${(window.App && typeof window.App.addrLink === 'function') ? window.App.addrLink(v.voter) : short(v.voter)}</td>
                <td class="p-3 font-semibold text-on-surface">${v.choice_labels.map(esc).join(', ')}</td>
                <td class="p-3 text-on-surface-variant">${esc(fmtDate(v.time))}</td>
                <td class="p-3 text-right font-label-code">
                  <a href="/verify/?tx=${esc(v.tx_hash)}" class="text-primary hover:underline font-bold inline-flex items-center gap-1">
                    ${esc(short(v.tx_hash))}
                    <span class="material-symbols-outlined text-[14px]">open_in_new</span>
                  </a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 5. Render bảng danh sách Whitelist (Detail Page Tab)
  function whitelistTable(entries, total, canRemove) {
    if (!entries || !entries.length) {
      return `
        <div class="text-center py-12 text-on-surface-variant flex flex-col items-center gap-2">
          <span class="material-symbols-outlined text-outline text-[42px]">rule</span>
          <p class="font-headline-sm font-semibold">Chưa có cử tri nào trong danh sách Whitelist.</p>
        </div>
      `;
    }
    return `
      <p class="font-body-sm text-on-surface-variant mb-2">Tổng cộng <b>${total}</b> ví được cấp quyền biểu quyết.</p>
      <div class="overflow-x-auto rounded-xl border border-surface-container-high/60">
        <table class="w-full text-left font-body-sm">
          <thead class="bg-surface-container-low text-on-surface-variant font-semibold border-b border-surface-container-high">
            <tr>
              <th class="p-3">Địa chỉ ví cử tri</th>
              <th class="p-3">Trạng thái</th>
              <th class="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-surface-container-high">
            ${entries.map((w) => `
              <tr class="hover:bg-surface-container-low/50 transition-colors">
                <td class="p-3 font-label-code">${(window.App && typeof window.App.addrLink === 'function') ? window.App.addrLink(w.address) : short(w.address)}</td>
                <td class="p-3">
                  ${w.voted
        ? '<span class="inline-flex items-center gap-1 text-tertiary font-bold"><span class="material-symbols-outlined text-[16px]">check_circle</span> Đã bỏ phiếu</span>'
        : '<span class="inline-flex items-center gap-1 text-amber-600 font-medium"><span class="material-symbols-outlined text-[16px]">schedule</span> Chưa bỏ</span>'
      }
                </td>
                <td class="p-3 text-right">
                  ${canRemove && !w.voted ? `
                    <button type="button" class="px-2.5 py-1 rounded-lg text-error hover:bg-red-50 font-headline-sm text-body-sm font-semibold transition-all inline-flex items-center gap-1 cursor-pointer" data-rm="${esc(w.address)}">
                      <span class="material-symbols-outlined text-[16px]">delete</span>
                      Gỡ quyền
                    </button>
                  ` : ''}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  // 6. Render các huy hiệu trạng thái chi tiết (Detail Page Badges)
  function detailBadges(e, live, isOwner) {
    const list = [];
    if (live === 'open') {
      list.push(`
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200/80 text-xs font-bold shadow-2xs">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Đang diễn ra
        </span>
      `);
    } else if (live === 'upcoming') {
      list.push(`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200/80 text-xs font-bold">
          <span class="material-symbols-outlined text-[15px]">schedule</span>
          Sắp diễn ra
        </span>
      `);
    } else if (live === 'closed') {
      list.push(`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-50 text-red-700 border border-red-200/80 text-xs font-bold">
          <span class="material-symbols-outlined text-[15px]">block</span>
          Đã đóng sớm
        </span>
      `);
    } else {
      list.push(`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold">
          <span class="material-symbols-outlined text-[15px]">task_alt</span>
          Đã kết thúc
        </span>
      `);
    }

    list.push(`
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200/70 text-xs font-semibold">
        <span class="material-symbols-outlined text-[15px]">${e.kind === 1 ? 'poll' : 'groups'}</span>
        ${e.kind === 1 ? 'Lấy ý kiến biểu quyết' : 'Bầu chọn ứng viên'}
      </span>
    `);

    list.push(`
      <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${e.is_private ? 'bg-purple-50 text-purple-700 border border-purple-200/70' : 'bg-slate-100 text-slate-700 border border-slate-200'} text-xs font-semibold">
        <span class="material-symbols-outlined text-[15px]">${e.is_private ? 'lock' : 'public'}</span>
        ${e.is_private ? 'Riêng tư (Whitelist)' : 'Công khai'}
      </span>
    `);

    if (isOwner) {
      list.push(`
        <span class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold shadow-2xs">
          <span class="material-symbols-outlined text-[15px] text-amber-600">shield_person</span>
          Của bạn (Owner)
        </span>
      `);
    }
    return list.join('');
  }

  // 7. Render thanh phân trang chung
  function pager(el, page, pages, go) {
    if (!el) return;
    const cur = Math.max(1, parseInt(page, 10) || 1);
    const total = Math.max(1, parseInt(pages, 10) || 1);

    if (total <= 1) {
      el.innerHTML = '';
      return;
    }

    // Tạo danh sách trang hiển thị (chuẩn UI tối đa 7 nút, hiển thị dấu "…" đối xứng hợp lý)
    let items = [];
    if (total <= 7) {
      items = Array.from({ length: total }, (_, i) => i + 1);
    } else if (cur <= 4) {
      items = [1, 2, 3, 4, 5, '…', total];
    } else if (cur >= total - 3) {
      items = [1, '…', total - 4, total - 3, total - 2, total - 1, total];
    } else {
      items = [1, '…', cur - 1, cur, cur + 1, '…', total];
    }

    const pageButtons = items.map((item) => {
      if (item === '…') {
        return `<span class="w-9 h-9 flex items-center justify-center text-outline select-none font-label-code text-sm">…</span>`;
      }
      const active = item === cur;
      return `
        <button type="button"
          class="w-9 h-9 rounded-xl flex items-center justify-center font-label-code text-label-code transition-all select-none border-0 ${active
          ? 'bg-primary text-white font-bold shadow-md cursor-default'
          : 'bg-surface-container-low text-on-surface hover:bg-blue-100 hover:text-blue-700 hover:shadow-sm hover:-translate-y-0.5 active:translate-y-0 cursor-pointer'
        }"
          ${active ? 'aria-current="page"' : ''}
          aria-label="${active ? `Trang hiện tại ${item}` : `Đến trang ${item}`}"
          data-p="${item}">
          ${item}
        </button>
      `;
    }).join('');

    el.innerHTML = `
      <div class="flex items-center gap-space-xs" role="navigation" aria-label="Phân trang">
        <button type="button"
          class="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low text-on-surface hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer select-none border-0"
          ${cur <= 1 ? 'disabled' : ''}
          aria-label="Trang trước"
          title="Trang trước"
          data-p="${cur - 1}">
          <span class="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        ${pageButtons}
        <button type="button"
          class="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low text-on-surface hover:bg-blue-100 hover:text-blue-700 disabled:opacity-40 disabled:pointer-events-none transition-all cursor-pointer select-none border-0"
          ${cur >= total ? 'disabled' : ''}
          aria-label="Trang sau"
          title="Trang sau"
          data-p="${cur + 1}">
          <span class="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    `;

    el.querySelectorAll('button[data-p]').forEach((b) => {
      b.addEventListener('click', () => {
        if (b.disabled) return;
        const target = parseInt(b.dataset.p, 10);
        if (target && target !== cur && target >= 1 && target <= total) {
          go(target);
        }
      });
    });
  }

  // 8. Thẻ gợi ý tạo hòm phiếu mới (Hiển thị ở ô cuối cùng trong lưới khi người dùng xem hết hòm phiếu)
  function createPromptCard() {
    return `
      <div class="rounded-2xl bg-gradient-to-br from-primary to-blue-700 text-white p-space-lg shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-space-md border border-blue-600/30 h-full">
        <div class="space-y-space-sm">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shadow-xs">
            <span class="material-symbols-outlined text-[24px]">add</span>
          </div>
          <div>
            <h4 class="font-headline-sm text-lg sm:text-xl text-white font-bold tracking-tight">Tạo Hòm Phiếu Mới</h4>
            <p class="font-body-sm text-xs sm:text-sm text-white/90 leading-relaxed mt-2">
              Khởi tạo cuộc biểu quyết độc lập cho tổ chức hoặc câu lạc bộ của bạn trong 3 bước.
            </p>
          </div>
        </div>
        <div class="pt-space-sm border-t border-white/20">
          <a href="/create/" class="btn-card-action w-full py-2.5 sm:py-3 rounded-xl bg-white text-primary font-headline-sm text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-blue-50 hover:text-blue-700 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all text-decoration-none shadow-sm">
            <span>Khởi tạo ngay</span>
            <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
          </a>
        </div>
      </div>
    `;
  }

  return { card, myCard, cardMy: myCard, candidateCard, votersTable, whitelistTable, detailBadges, pager, createPromptCard };
})();