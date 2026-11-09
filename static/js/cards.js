/* Thẻ hiển thị 1 hòm phiếu — Tối ưu Light Theme & FontAwesome */
window.ElectionCards = (function () {
  const { esc, short, fmtDate, statusBadge, kindBadge } = App;

  // Xử lý icon thời gian theo trạng thái
  function timeLine(e) {
    if (e.status === 'upcoming') 
        return `<i class="fa-solid fa-hourglass-start" style="color: var(--warn); margin-right: 4px;"></i> Bắt đầu: ${fmtDate(e.start_time)}`;
    if (e.status === 'open') 
        return e.end_time ? `<i class="fa-solid fa-stopwatch" style="color: var(--accent); margin-right: 4px;"></i> Kết thúc: ${fmtDate(e.end_time)}` : `<i class="fa-solid fa-infinity" style="color: var(--accent); margin-right: 4px;"></i> Không giới hạn`;
    return e.end_time ? `<i class="fa-solid fa-flag-checkered" style="color: var(--muted); margin-right: 4px;"></i> Kết thúc: ${fmtDate(e.end_time)}` : `<i class="fa-solid fa-ban" style="color: var(--danger); margin-right: 4px;"></i> Đã đóng`;
  }

  // Render thẻ hòm phiếu (Card)
  function card(e, me) {
    const mine = me && App.sameAddr(me, e.owner) 
        ? '<span class="badge owner" style="background: #fef9c3; color: #854d0e; border: 1px solid #fde68a;"><i class="fa-solid fa-crown"></i> Của bạn</span>' 
        : '';
    const rule = e.max_choices > 1 ? `chọn tối đa ${e.max_choices}` : 'chọn 1';
    const privateBadge = e.is_private 
        ? '<span class="badge private" style="background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff;"><i class="fa-solid fa-lock"></i> Riêng tư</span>' 
        : '';

    // Lưu ý: kindBadge và statusBadge được gọi từ common.js. 
    // Các phần tử khác đã được thay icon FontAwesome đồng bộ.
    return `<a class="card election-card" href="/election/${esc(e.address)}/" style="text-decoration: none; display: flex; flex-direction: column; gap: 10px;">
      <div class="row" style="gap: 8px; flex-wrap: wrap;">
        ${statusBadge(e.status)} 
        ${kindBadge(e.kind)} 
        ${privateBadge} 
        ${mine}
      </div>
      <h3 style="color: var(--text-main); margin: 4px 0;">${esc(e.name)}</h3>
      
      <div class="meta" style="display: flex; flex-wrap: wrap; gap: 14px; margin-top: auto;">
        <span style="display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-users" style="color: var(--muted);"></i> ${e.total_voters} cử tri</span>
        <span style="display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-list-check" style="color: var(--muted);"></i> ${e.option_count} lựa chọn (${rule})</span>
      </div>
      
      <div class="meta" style="margin-top: 2px;">
        <span>${timeLine(e)}</span>
      </div>
      
      <div class="meta" style="margin-top: 2px; border-top: 1px dashed var(--glass-border); padding-top: 10px;">
        <span><i class="fa-solid fa-user-shield" style="color: var(--muted); margin-right: 4px;"></i> Chủ sở hữu: <span class="mono" style="color: var(--accent);">${esc(short(e.owner))}</span></span>
      </div>
    </a>`;
  }

  // Render thanh phân trang
  function pager(el, page, pages, go) {
    if (pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `
      <button class="btn btn-ghost btn-sm" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">
        <i class="fa-solid fa-chevron-left"></i> Trước
      </button>
      <span class="muted small" style="font-weight: 600; padding: 0 12px;">Trang ${page} / ${pages}</span>
      <button class="btn btn-ghost btn-sm" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">
        Sau <i class="fa-solid fa-chevron-right"></i>
      </button>
    `;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.p)));
  }

  return { card, pager };
})();