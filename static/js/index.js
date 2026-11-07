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
      if ($('syncWarning')) $('syncWarning').classList.toggle('hidden', !d.indexer.lagging);
      
      const listEl = $('list');
      if (listEl) {
          listEl.innerHTML = d.elections.length
            ? d.elections.map((e) => ElectionCards.card(e, App.state.address)).join('')
            : `<div class="empty" style="grid-column:1/-1; text-align:center; padding:60px 20px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:16px; box-shadow:var(--shadow-sm);">
                 <i class="fa-solid fa-folder-open fa-3x" style="color:#cbd5e1; margin-bottom:16px; display:block;"></i>
                 <p style="font-size:1.1rem; font-weight:500; margin-bottom:20px; color:var(--text-main);">Chưa có hòm phiếu nào phù hợp.</p>
                 <a href="/create/" class="btn btn-primary" style="display:inline-flex; align-items:center; gap:8px;"><i class="fa-solid fa-plus"></i> Tạo hòm phiếu ngay</a>
               </div>`;
      }
      
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

  const tabs = $('statusChips');
  if (tabs) {
      tabs.addEventListener('click', (ev) => {
        const b = ev.target.closest('button'); if (!b) return;
        tabs.querySelectorAll('button').forEach((c) => {
            c.classList.toggle('active', c === b);
            if (c.classList.contains('tab-btn')) {
                c.style.background = c === b ? 'var(--accent)' : 'transparent';
                c.style.color = c === b ? '#ffffff' : 'var(--text-muted)';
                c.style.borderColor = c === b ? 'var(--accent)' : 'transparent';
            }
        });
        st.status = b.dataset.status || 'all'; 
        st.page = 1; 
        load();
      });
  }

  if ($('kind')) {
      $('kind').addEventListener('change', (e) => { 
          st.kind = e.target.value; 
          st.page = 1; 
          load(); 
      });
  }

  if ($('q')) {
      $('q').addEventListener('input', App.debounce((e) => { 
          st.q = e.target.value.trim(); 
          st.page = 1; 
          load(); 
      }, 350));
  }

  await load();
  App.watch('all', App.debounce(load, 800));
})();