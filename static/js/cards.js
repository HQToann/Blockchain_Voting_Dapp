/* Thẻ hiển thị 1 hòm phiếu — dùng chung cho trang Khám phá và Của tôi. */
window.ElectionCards = (function () {
  const { esc, short, fmtDate, statusBadge, kindBadge } = App;

  function timeLine(e) {
    if (e.status === 'upcoming') return `⏳ Bắt đầu: ${fmtDate(e.start_time)}`;
    if (e.status === 'open') return e.end_time ? `⏱ Kết thúc: ${fmtDate(e.end_time)}` : '⏱ Không giới hạn thời gian';
    return e.end_time ? `🏁 Kết thúc: ${fmtDate(e.end_time)}` : '🏁 Đã đóng';
  }

  function card(e, me) {
    const mine = me && App.sameAddr(me, e.owner) ? '<span class="badge owner">⭐ Của bạn</span>' : '';
    const rule = e.max_choices > 1 ? `chọn tối đa ${e.max_choices}` : 'chọn 1';
    return `<a class="card election-card" href="/election/${esc(e.address)}/">
      <div class="row">${statusBadge(e.status)} ${kindBadge(e.kind)} ${e.is_private ? '<span class="badge private">🔒 Riêng tư</span>' : ''} ${mine}</div>
      <h3>${esc(e.name)}</h3>
      <div class="meta"><span>🗳 ${e.total_voters} cử tri</span><span>📋 ${e.option_count} lựa chọn (${rule})</span></div>
      <div class="meta"><span>${timeLine(e)}</span></div>
      <div class="meta"><span>Chủ: <span class="mono">${esc(short(e.owner))}</span></span></div>
    </a>`;
  }

  function pager(el, page, pages, go) {
    if (pages <= 1) { el.innerHTML = ''; return; }
    el.innerHTML = `<button class="btn-ghost btn-sm" ${page <= 1 ? 'disabled' : ''} data-p="${page - 1}">← Trước</button>
      <span class="muted small">Trang ${page}/${pages}</span>
      <button class="btn-ghost btn-sm" ${page >= pages ? 'disabled' : ''} data-p="${page + 1}">Sau →</button>`;
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => go(+b.dataset.p)));
  }

  return { card, pager };
})();
