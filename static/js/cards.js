/**
 * Thư viện Giao diện Thẻ & Phân trang dùng chung (VoteChain UI Cards)
 * Chuẩn hóa thiết kế Material 3 & Tailwind CSS
 */
window.ElectionCards = (function () {
  'use strict';
  const { esc, short, fmtDate, fmtDuration } = App;

  // 1. Thẻ Hòm Phiếu Khám Phá (Dùng trên trang Chủ / Khám Phá)
  function card(e, me) {
    const isOwner = me && App.sameAddr(me, e.owner);
    const rule = e.max_choices > 1 ? `chọn từ 1 đến ${e.max_choices}` : 'chọn 1';
    const pollId = `#${e.address.slice(2, 6).toUpperCase()}-${e.address.slice(-4).toUpperCase()}`;

    let statusHtml = '';
    if (e.status === 'open') {
      const remaining = e.end_time ? fmtDuration(Date.parse(e.end_time) - Date.now()) : 'Không hẹn giờ';
      statusHtml = `
        <span class="px-2.5 py-1 rounded-full bg-[#ECFDF5] text-[#065F46] font-semibold flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></span>
          Đang mở • Còn ${esc(remaining)}
        </span>
      `;
    } else if (e.status === 'upcoming') {
      statusHtml = `
        <span class="px-2.5 py-1 rounded-full bg-[#FFFBEB] text-[#92400E] font-semibold flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-[#F59E0B]"></span>
          Sắp diễn ra
        </span>
      `;
    } else {
      statusHtml = `
        <span class="px-2.5 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-semibold flex items-center gap-1.5 text-xs">
          <span class="w-2 h-2 rounded-full bg-outline"></span>
          Đã kết thúc
        </span>
      `;
    }

    const kindLabel = e.kind === 1 ? 'LẤY Ý KIẾN CỘNG ĐỒNG' : 'BẦU CỬ ỨNG VIÊN';

    let extraBadges = '';
    if (e.is_private) {
      extraBadges += `<span class="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[11px] font-semibold border border-purple-200">Riêng tư</span> `;
    }
    if (isOwner) {
      extraBadges += `<span class="px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 text-[11px] font-semibold border border-amber-200">Của bạn</span>`;
    }

    let actionBtn = '';
    if (e.status === 'open') {
      actionBtn = `
        <a class="w-full py-2.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-primary transition-colors shadow-sm" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px]">how_to_vote</span>
          Bỏ phiếu ngay
        </a>
      `;
    } else if (e.status === 'upcoming') {
      actionBtn = `
        <a class="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-surface-variant transition-colors" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-primary">schedule</span>
          Xem chi tiết
        </a>
      `;
    } else {
      actionBtn = `
        <a class="w-full py-2.5 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-headline-sm flex items-center justify-center gap-2 hover:bg-surface-variant transition-colors" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-tertiary">query_stats</span>
          Xem kết quả
        </a>
      `;
    }

    const votersCount = e.total_voters || 0;
    const optsCount = e.option_count || 0;

    return `
      <div class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-space-md border border-slate-100">
        <div class="space-y-space-sm">
          <div class="flex items-center justify-between text-xs">
            ${statusHtml}
            <span class="font-label-code text-label-code text-outline">${pollId}</span>
          </div>

          <div>
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="font-label-tag text-label-tag text-primary uppercase font-bold text-xs">${kindLabel}</span>
              ${extraBadges}
            </div>
            <h4 class="font-headline-sm text-headline-sm text-on-surface font-bold mt-1 line-clamp-1" title="${esc(e.name)}">${esc(e.name)}</h4>
            <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">
              Gồm <b>${optsCount}</b> lựa chọn (${rule}). Tạo bởi ví <span class="font-label-code text-xs text-primary">${esc(short(e.owner))}</span>.
            </p>
          </div>

          <div class="space-y-1 pt-1">
            <div class="flex items-center justify-between font-label-code text-label-code text-xs">
              <span class="text-on-surface-variant flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px] text-outline">group</span>
                Tiến độ: <b class="text-on-surface font-semibold">${votersCount}</b> cử tri đã bỏ phiếu
              </span>
            </div>
            <div class="w-full h-2 bg-surface-container rounded-full overflow-hidden">
              <div class="h-full bg-primary rounded-full transition-all" style="width: ${votersCount > 0 ? Math.min(100, Math.max(15, votersCount * 10)) : 0}%"></div>
            </div>
          </div>
        </div>

        <div class="pt-space-sm border-t border-surface-container">
          ${actionBtn}
        </div>
      </div>
    `;
  }

  // 2. Thẻ Hòm Phiếu Cá Nhân (Dùng trên trang Hòm Phiếu Của Tôi)
  function myCard(e, me, isVotedTab) {
    const explorerUrl = App.cfg.explorer_url || 'https://sepolia.etherscan.io';
    const isOwner = me && App.sameAddr(me, e.owner);

    let statusBadge = '';
    let timeLabel = '';
    if (e.status === 'open') {
      const remaining = e.end_time ? fmtDuration(Date.parse(e.end_time) - Date.now()) : 'Không hẹn giờ';
      statusBadge = `
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 font-label-tag text-label-tag font-bold tracking-wide">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          ĐANG MỞ
        </span>
      `;
      timeLabel = `
        <div class="flex items-center gap-1.5 text-error font-medium">
          <span class="material-symbols-outlined text-[18px]">alarm</span>
          <span>Kết thúc: ${esc(fmtDate(e.end_time))}</span>
          <span class="px-2 py-0.5 rounded-full bg-error-container text-on-error-container font-label-tag text-label-tag font-bold">Còn ${esc(remaining)}</span>
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
        <a class="px-space-md py-2.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-semibold shadow hover:bg-primary transition-colors flex items-center gap-2" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px]">how_to_vote</span>
          <span>${isOwner ? 'Vào hòm phiếu' : 'Bỏ phiếu ngay'}</span>
        </a>
      `;
    } else {
      ctaBtn = `
        <a class="px-space-md py-2.5 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-headline-sm font-semibold hover:bg-surface-container-highest transition-colors flex items-center gap-2" href="/election/${esc(e.address)}/">
          <span class="material-symbols-outlined text-[18px] text-primary">insights</span>
          <span>Xem kết quả</span>
        </a>
      `;
    }

    const votersCount = e.total_voters || 0;
    const ruleText = e.max_choices > 1 ? `Chọn từ 1 đến ${e.max_choices} lựa chọn` : 'Chọn đúng 1 lựa chọn';

    return `
      <div class="group relative overflow-hidden rounded-2xl bg-surface-container-lowest p-space-md md:p-space-lg shadow-sm hover:shadow-lg transition-all duration-300 border border-surface-container-high/60">
        <div class="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-container via-secondary-container to-tertiary-container"></div>
        <div class="flex flex-col gap-space-md">
          <div class="flex flex-wrap items-center justify-between gap-space-sm">
            <div class="flex flex-wrap items-center gap-2">
              ${statusBadge}
              ${kindBadge}
              ${roleBadge}
              ${e.is_private ? '<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-purple-50 text-purple-700 font-label-tag text-label-tag font-semibold border border-purple-200"><span class="material-symbols-outlined text-[12px]">lock</span> Riêng tư</span>' : ''}
            </div>
            <div class="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-surface-container-low text-on-surface-variant font-label-code text-label-code border border-surface-container-high/40">
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

          <div class="pt-space-xs flex flex-wrap items-center justify-between gap-space-sm border-t border-surface-container-high/40">
            <div class="flex flex-wrap items-center gap-2">
              <a class="px-3.5 py-2 rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-headline-sm text-headline-sm text-xs font-semibold flex items-center gap-1.5 transition-colors" href="/election/${esc(e.address)}/">
                <span class="material-symbols-outlined text-[16px] text-primary">tune</span>
                Chi tiết &amp; Quản lý
              </a>
              <button type="button" class="btn-share px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-headline-sm text-headline-sm text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer" data-url="${window.location.origin}/election/${esc(e.address)}/">
                <span class="material-symbols-outlined text-[16px]">share</span>
                Chia sẻ link
              </button>
              <a class="px-3.5 py-2 rounded-lg bg-surface-container-low hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface font-headline-sm text-headline-sm text-xs font-medium flex items-center gap-1.5 transition-colors" href="${explorerUrl}/address/${esc(e.address)}" target="_blank" rel="noopener noreferrer">
                <span class="material-symbols-outlined text-[16px] text-tertiary">open_in_new</span>
                Xem sổ cái TxHash
              </a>
            </div>
            <div class="flex items-center gap-2 text-on-surface-variant font-label-code text-body-sm">
              <span class="material-symbols-outlined text-[16px] text-tertiary">verified</span>
              <span>On-Chain Verified</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Thẻ Ứng Viên / Lựa Chọn Bỏ Phiếu (Dùng trên trang Chi Tiết)
  function candidateCard(o, ctx) {
    const { isLeader, sel, canPick, full, noun, kind, myVoted, contractAddress } = ctx;
    const initial = esc(o.label.charAt(0).toUpperCase());

    return `
      <div class="candidate-card bg-surface-container-lowest rounded-2xl p-space-lg shadow-sm border transition-all duration-300 relative ${sel ? 'ring-2 ring-primary-container bg-primary-container/[0.02] border-primary-container/40' : 'border-surface-container-high/60 hover:shadow-md'} ${canPick && !full ? 'cursor-pointer' : (sel ? 'cursor-pointer' : 'cursor-default')} ${full || (!canPick && !sel && myVoted) ? 'opacity-60' : 'opacity-100'}" data-candidate-id="${o.id}" data-candidate-name="${esc(o.label)}">
        ${isLeader ? `
          <div class="absolute top-4 right-4 flex items-center gap-space-xs z-10">
            <span class="px-2.5 py-1 rounded-full bg-primary-container text-on-primary font-label-tag text-label-tag font-bold flex items-center gap-1 shadow-sm">
              <span class="material-symbols-outlined text-[14px]">check_circle</span> Đang dẫn đầu
            </span>
          </div>
        ` : ''}

        <div class="flex flex-col sm:flex-row items-start gap-space-lg">
          <div class="relative shrink-0">
            ${o.image_url ? `
              <img class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover shadow-sm bg-surface-container border border-surface-container-high/60" src="${esc(o.image_url)}" alt="${esc(o.label)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary font-bold text-3xl shadow-sm border border-surface-container-high\\'>${initial}</div>';">
            ` : `
              <div class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl bg-surface-container-high flex items-center justify-center text-primary font-bold text-3xl shadow-sm border border-surface-container-high">
                ${initial}
              </div>
            `}
            ${isLeader ? `
              <div class="absolute -bottom-2 -right-2 w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center shadow-md">
                <span class="material-symbols-outlined text-[18px]">verified</span>
              </div>
            ` : ''}
          </div>

          <div class="flex-1 flex flex-col gap-space-sm min-w-0 w-full">
            <div class="flex flex-col">
              <span class="font-label-code text-label-code ${sel || isLeader ? 'text-primary font-bold' : 'text-outline font-semibold'}">
                #${noun} ${String(o.id + 1).padStart(2, '0')}
              </span>
              <h3 class="font-headline-lg text-headline-lg text-on-surface font-bold leading-tight">
                ${esc(o.label)}
              </h3>
            </div>

            ${o.description ? `
              <div class="bg-surface-container-low p-space-md rounded-xl flex flex-col gap-1 border border-surface-container-high/40">
                <div class="flex items-center gap-1 ${isLeader ? 'text-primary' : 'text-secondary'} font-headline-sm text-body-md font-bold">
                  <span class="material-symbols-outlined text-[18px]">flag</span>
                  ${kind === 1 ? 'Nội dung chi tiết' : 'Cương lĩnh hành động'}
                </div>
                <p class="font-body-md text-body-md text-on-surface-variant leading-relaxed whitespace-pre-wrap">
                  ${esc(o.description)}
                </p>
              </div>
            ` : ''}

            <div class="flex flex-col gap-space-xs pt-space-xs">
              <div class="flex justify-between items-center font-headline-sm text-body-md">
                <span class="text-on-surface font-semibold flex items-center gap-1">
                  <span class="material-symbols-outlined text-primary text-[18px]">how_to_vote</span>
                  Số phiếu ủng hộ: <strong class="text-primary font-bold ml-1">${o.votes} phiếu</strong>
                </span>
                <span class="font-label-code text-label-code text-primary font-bold">${o.percent}%</span>
              </div>
              <div class="w-full h-3 rounded-full bg-surface-container-high overflow-hidden">
                <div class="h-full ${isLeader ? 'bg-gradient-to-r from-primary to-secondary' : 'bg-primary-container'} rounded-full transition-all duration-500" style="width: ${Math.min(100, o.percent)}%"></div>
              </div>
            </div>

            <div class="pt-space-sm flex items-center justify-between gap-space-md flex-wrap">
              ${canPick ? `
                <button class="candidate-select-btn w-full sm:w-auto px-space-lg py-space-sm rounded-xl font-headline-sm text-headline-sm font-bold flex items-center justify-center gap-space-xs transition-all shadow-sm ${sel ? 'bg-primary-container text-on-primary' : 'bg-surface-container-high text-on-surface hover:bg-surface-container-highest cursor-pointer'}" type="button">
                  <span class="material-symbols-outlined text-[20px]">${sel ? 'radio_button_checked' : 'radio_button_unchecked'}</span>
                  ${sel ? 'Đã chọn ứng viên này' : 'Chọn ứng viên'}
                </button>
              ` : (myVoted ? `
                <span class="px-space-md py-1.5 rounded-xl bg-on-tertiary-container text-tertiary font-label-tag text-label-tag font-bold flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">how_to_reg</span> Bạn đã bỏ phiếu cho lựa chọn này
                </span>
              ` : `
                <span class="font-body-sm text-body-sm text-outline flex items-center gap-1">
                  <span class="material-symbols-outlined text-[16px]">lock</span> Không thể bình chọn
                </span>
              `)}

              <a class="text-primary font-body-sm text-body-sm font-semibold flex items-center gap-1 hover:underline ml-auto" href="https://sepolia.etherscan.io/address/${esc(contractAddress)}" target="_blank" rel="noopener">
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
                <td class="p-3 font-label-code">${App.addrLink(v.voter)}</td>
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
                <td class="p-3 font-label-code">${App.addrLink(w.address)}</td>
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
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-on-tertiary-container text-tertiary font-label-tag text-label-tag font-bold tracking-wide uppercase shadow-sm">
          <span class="w-2 h-2 rounded-full bg-tertiary animate-ping"></span>
          BỎ PHIẾU ĐANG DIỄN RA
        </span>
      `);
    } else if (live === 'upcoming') {
      list.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-800 font-label-tag text-label-tag font-bold tracking-wide uppercase">
          <span class="material-symbols-outlined text-[14px]">schedule</span>
          SẮP DIỄN RA
        </span>
      `);
    } else if (live === 'closed') {
      list.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-error-container text-error font-label-tag text-label-tag font-bold tracking-wide uppercase">
          <span class="material-symbols-outlined text-[14px]">block</span>
          ĐÃ ĐÓNG SỚM
        </span>
      `);
    } else {
      list.push(`
        <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-surface-container-high text-on-surface-variant font-label-tag text-label-tag font-bold tracking-wide uppercase">
          <span class="material-symbols-outlined text-[14px]">flag</span>
          ĐÃ KẾT THÚC
        </span>
      `);
    }

    list.push(`
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low text-secondary font-label-tag text-label-tag font-semibold">
        <span class="material-symbols-outlined text-[14px]">${e.kind === 1 ? 'poll' : 'badge'}</span>
        ${e.kind === 1 ? 'Lấy ý kiến biểu quyết' : 'Bầu chọn ứng viên'}
      </span>
    `);

    list.push(`
      <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low ${e.is_private ? 'text-purple-700' : 'text-primary'} font-label-tag text-label-tag font-semibold">
        <span class="material-symbols-outlined text-[14px]">${e.is_private ? 'lock' : 'public'}</span>
        ${e.is_private ? 'Riêng tư (Whitelist)' : 'Công khai'}
      </span>
    `);

    if (isOwner) {
      list.push(`
        <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-300 font-label-tag text-label-tag font-bold shadow-xs">
          <span class="material-symbols-outlined text-[14px] text-amber-600">shield_person</span>
          Của bạn (Owner)
        </span>
      `);
    }
    return list.join('');
  }

  // 7. Render thanh phân trang chung
  function pager(el, page, pages, go) {
    if (pages <= 1) { el.innerHTML = ''; return; }

    let pageButtons = '';
    for (let p = 1; p <= pages; p++) {
      if (p === 1 || p === pages || (p >= page - 1 && p <= page + 1)) {
        const active = p === page;
        pageButtons += `
          <button type="button" class="w-9 h-9 rounded-xl flex items-center justify-center font-label-code text-label-code transition-colors cursor-pointer ${active ? 'bg-primary-container text-on-primary font-bold shadow-sm' : 'bg-surface-container-low text-on-surface hover:bg-surface-container-high'}" data-p="${p}">
            ${p}
          </button>
        `;
      } else if (p === page - 2 || p === page + 2) {
        pageButtons += `<span class="px-1 text-outline">…</span>`;
      }
    }

    el.innerHTML = `
      <div class="flex items-center gap-space-xs">
        <button type="button" class="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">
          <span class="material-symbols-outlined text-[18px]">chevron_left</span>
        </button>
        ${pageButtons}
        <button type="button" class="w-9 h-9 rounded-xl flex items-center justify-center bg-surface-container-low text-on-surface hover:bg-surface-container-high disabled:opacity-40 disabled:pointer-events-none transition-colors cursor-pointer" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">
          <span class="material-symbols-outlined text-[18px]">chevron_right</span>
        </button>
      </div>
    `;
    el.querySelectorAll('button[data-p]').forEach((b) => b.addEventListener('click', () => go(+b.dataset.p)));
  }

  return { card, myCard, candidateCard, votersTable, whitelistTable, detailBadges, pager };
})();
