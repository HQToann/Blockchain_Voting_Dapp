(async () => {
  await App.init();
  const $ = (id) => document.getElementById(id);
  const st = { tab: 'owner', page: 1 };

  async function load() {
    const me = App.state.address;
    if (!me) return;                      // chưa kết nối ví: không gọi API
    
    const p = new URLSearchParams({ page: st.page, page_size: 12, status: 'all' });
    p.set(st.tab === 'owner' ? 'owner' : 'voted', me);
    
    try {
      const d = await App.api('/api/elections/?' + p);
      
      const listEl = $('list');
      if (listEl) {
          // Giao diện khi không có dữ liệu (Light Theme)
          listEl.innerHTML = d.elections.length
            ? d.elections.map((e) => ElectionCards.card(e, me)).join('')
            : `<div class="empty" style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:16px; box-shadow:var(--shadow-sm);">
                 <i class="fa-solid ${st.tab === 'owner' ? 'fa-box-open' : 'fa-clock-rotate-left'} fa-3x" style="color:#cbd5e1; margin-bottom:16px; display:block;"></i>
                 <p style="font-size:1.1rem; font-weight:500; margin-bottom:20px; color:var(--text-main);">
                    ${st.tab === 'owner' ? 'Bạn chưa tạo hòm phiếu nào.' : 'Bạn chưa tham gia bỏ phiếu trong hòm phiếu nào.'}
                 </p>
                 ${st.tab === 'owner' 
                    ? '<a href="/create/" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;"><i class="fa-solid fa-plus"></i> Tạo hòm phiếu ngay</a>' 
                    : '<a href="/" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;"><i class="fa-solid fa-magnifying-glass"></i> Khám phá ngay</a>'}
               </div>`;
      }
      
      // Cuộn lên đầu khi chuyển trang
      if ($('pager')) ElectionCards.pager($('pager'), d.page, d.pages, (n) => { 
          st.page = n; 
          load(); 
          window.scrollTo({ top: 0, behavior: 'smooth' }); 
      });
    } catch (e) {
      if ($('list')) {
          $('list').innerHTML = `<div class="notice error" style="grid-column:1/-1; background:var(--danger-soft); border-left:4px solid var(--danger); padding:16px; border-radius:12px; color:var(--danger); display:flex; align-items:center; gap:12px; font-weight:500;">
            <i class="fa-solid fa-triangle-exclamation" style="font-size:1.5rem;"></i> <span>${App.esc(e.message)}</span>
          </div>`;
      }
    }
  }

  function show() {
    const ok = !!App.state.address;
    if ($('needWallet')) $('needWallet').classList.toggle('hidden', ok);
    if ($('mine')) $('mine').classList.toggle('hidden', !ok);
    if (ok) load();
  }

  if ($('btnConnect')) {
      $('btnConnect').addEventListener('click', () => App.connect().then(show).catch((e) => { 
          if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error'); 
      }));
  }

  // ĐÃ SỬA: Đổi từ .tab sang .tab-btn cho khớp với HTML và thêm hiệu ứng chuyển màu
  document.querySelectorAll('.tab-btn').forEach((t) => t.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((x) => {
        x.classList.toggle('active', x === t);
        x.style.background = x === t ? 'var(--accent)' : 'transparent';
        x.style.color = x === t ? '#ffffff' : 'var(--text-muted)';
        x.style.borderColor = x === t ? 'var(--accent)' : 'transparent';
    });
    st.tab = t.dataset.tab; 
    st.page = 1; 
    load();
  }));
  
  show();
  App.watch('all', App.debounce(() => App.state.address && load(), 800));
})();