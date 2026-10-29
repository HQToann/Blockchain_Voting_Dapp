(async () => {
  await App.init();
  const st = { status: 'all', kind: '', q: '', page: 1 };
  const $ = (id) => document.getElementById(id);

  async function load() {
    const p = new URLSearchParams({ status: st.status, page: st.page, page_size: 12 });
    if (st.kind) p.set('kind', st.kind);
    if (st.q) p.set('q', st.q);
    try {
      const d = await App.api('/api/elections/?' + p);
      $('syncWarning').classList.toggle('hidden', !d.indexer.lagging);
      $('list').innerHTML = d.elections.length
        ? d.elections.map((e) => ElectionCards.card(e, App.state.address)).join('')
        : '<div class="empty" style="grid-column:1/-1">Chưa có hòm phiếu nào phù hợp. Hãy là người đầu tiên <a href="/create/">tạo hòm phiếu</a>!</div>';
      ElectionCards.pager($('pager'), d.page, d.pages, (n) => { st.page = n; load(); window.scrollTo(0, 0); });
    } catch (e) {
      $('list').innerHTML = `<div class="notice error" style="grid-column:1/-1">${App.esc(e.message)}</div>`;
    }
  }

  $('statusChips').addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    document.querySelectorAll('#statusChips .chip').forEach((c) => c.classList.toggle('active', c === b));
    st.status = b.dataset.status; st.page = 1; load();
  });
  $('kind').addEventListener('change', (e) => { st.kind = e.target.value; st.page = 1; load(); });
  $('q').addEventListener('input', App.debounce((e) => { st.q = e.target.value.trim(); st.page = 1; load(); }, 350));

  await load();
  // Realtime: có hòm phiếu mới / phiếu mới / đổi trạng thái -> tải lại danh sách (không cộng dồn thủ công)
  App.watch('all', App.debounce(load, 800));
})();
