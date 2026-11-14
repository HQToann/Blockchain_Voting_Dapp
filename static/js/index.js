(async () => {
  await App.init();
  const st = { status: 'all', kind: '', q: '', page: 1, sort: 'newest' };
  const $ = App.$;

  // 1. Thống kê dữ liệu thực từ hệ thống Backend
  async function updateStats() {
    try {
      const [resAll, resOpen] = await Promise.all([
        App.api('/api/elections/?page_size=100'),
        App.api('/api/elections/?status=open&page_size=1')
      ]);

      const totalElections = resAll.total || 0;
      const openCount = resOpen.total || 0;
      let totalVotes = 0;
      if (resAll.elections) {
        resAll.elections.forEach(e => totalVotes += (e.total_voters || 0));
      }

      if ($('statTotalVotes')) $('statTotalVotes').textContent = totalVotes.toLocaleString('vi-VN');
      if ($('statTotalElections')) $('statTotalElections').textContent = `${totalElections} hòm`;
      if ($('statOpenElections')) $('statOpenElections').textContent = `${openCount} đang mở`;
      if ($('statTotalVoters')) $('statTotalVoters').textContent = totalVotes.toLocaleString('vi-VN');

      // Cập nhật số đếm trên các Tab
      if ($('tabCountAll')) $('tabCountAll').textContent = `(${totalElections})`;
      if ($('tabCountOpen')) $('tabCountOpen').textContent = `(Live - ${openCount})`;
    } catch (err) {
      console.warn('Lỗi cập nhật thống kê:', err);
    }
  }

  // 2. Tải danh sách hòm phiếu thật từ API
  async function load() {
    const p = new URLSearchParams({ status: st.status, page: st.page, page_size: 8 });
    if (st.kind) p.set('kind', st.kind);
    if (st.q) p.set('q', st.q);
    
    // [THÊM MỚI]: Gửi tín hiệu cho Backend (Django) biết để nó lấy dữ liệu mới nhất (đảo ngược ID)
    if (st.sort === 'newest') p.set('ordering', '-id');

    try {
      const d = await App.api('/api/elections/?' + p);
      if ($('syncWarning')) $('syncWarning').classList.toggle('hidden', !d.indexer.lagging);

      const listEl = $('electionGrid');
      if (listEl) {
        if (!d.elections || d.elections.length === 0) {
          listEl.innerHTML = `
            <div class="col-span-full py-16 px-6 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/60 shadow-sm">
              <div class="w-16 h-16 rounded-full bg-primary-fixed flex items-center justify-center mx-auto mb-4 text-primary">
                <span class="material-symbols-outlined text-[32px]">how_to_vote</span>
              </div>
              <h3 class="font-headline-sm text-headline-sm text-on-surface font-bold">Chưa có cuộc bầu cử nào phù hợp</h3>
              <p class="font-body-sm text-body-sm text-on-surface-variant max-w-md mx-auto mt-2 mb-6">Hãy là người đầu tiên khởi tạo cuộc bỏ phiếu phi tập trung trên mạng Sepolia!</p>
              <a href="/create/" class="inline-flex items-center gap-2 px-space-xl py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm shadow-md hover:opacity-95 transition-all text-decoration-none">
                <span class="material-symbols-outlined text-[20px]">add_box</span> + Tạo hòm phiếu ngay
              </a>
            </div>`;
        } else {
          
          let items = [...d.elections];
          
          // [SỬA LẠI LOGIC]: Ép thuật toán sắp xếp đẩy hòm phiếu có thời gian bắt đầu mới nhất lên đầu danh sách
          if (st.sort === 'newest') {
            items.sort((a, b) => {
              const tA = Date.parse(a.start_time) || a.created_block || 0;
              const tB = Date.parse(b.start_time) || b.created_block || 0;
              return tB - tA; 
            });
          } else if (st.sort === 'most_votes') {
            items.sort((a, b) => (b.total_voters || 0) - (a.total_voters || 0));
          } else if (st.sort === 'closing_soon') {
            items.sort((a, b) => (Date.parse(a.end_time || '9999-12-31') || 0) - (Date.parse(b.end_time || '9999-12-31') || 0));
          }

          let cardsHtml = items.map((e) => ElectionCards.card(e, App.state.address)).join('');

          // Thêm thẻ CTA "Tạo Hòm Phiếu Mới" ở cuối lưới
          cardsHtml += `
            <div class="rounded-2xl p-space-lg bg-primary text-on-primary shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-space-md bg-gradient-to-br from-primary to-primary-container">
              <div class="space-y-space-sm">
                <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
                  <span class="material-symbols-outlined text-white text-[24px]">add_box</span>
                </div>
                <h4 class="font-headline-md text-headline-md font-bold text-white">Tạo Hòm Phiếu Mới</h4>
                <p class="font-body-sm text-body-sm text-white/80">Khởi tạo cuộc biểu quyết độc lập cho tổ chức hoặc câu lạc bộ của bạn trong 3 bước.</p>
              </div>
              <div class="pt-space-md">
                <a class="w-full py-2.5 rounded-xl bg-white text-primary font-headline-sm text-headline-sm flex items-center justify-center gap-1 hover:bg-surface transition-all shadow-sm font-bold text-decoration-none" href="/create/">
                  Khởi tạo ngay
                  <span class="material-symbols-outlined text-[18px]">arrow_forward</span>
                </a>
              </div>
            </div>`;

          listEl.innerHTML = cardsHtml;
        }
      }

      // Phân trang
      if ($('pager')) {
        ElectionCards.pager($('pager'), d.page, d.pages, (n) => {
          st.page = n;
          load();
          const target = $('explore-ballots');
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
      }

      if ($('paginationSummary')) {
        const start = d.total > 0 ? (d.page - 1) * d.page_size + 1 : 0;
        const end = Math.min(d.total, d.page * d.page_size);
        $('paginationSummary').innerHTML = d.total > 0 
          ? `Hiển thị <span class="font-bold text-on-surface">${start} - ${end}</span> trên tổng số <span class="font-bold text-on-surface">${d.total}</span> hòm phiếu`
          : '0 hòm phiếu';
      }

    } catch (e) {
      if ($('electionGrid')) {
        $('electionGrid').innerHTML = `
          <div class="col-span-full p-space-lg rounded-2xl bg-[#FEF2F2] border border-[#FCA5A5] text-[#991B1B] flex items-center gap-3">
            <span class="material-symbols-outlined text-[24px] text-[#DC2626]">error</span>
            <span class="font-medium">Không thể kết nối máy chủ: ${App.esc(e.message)}</span>
          </div>`;
      }
    }
  }

  // 3. Bắt sự kiện chuyển Tab trạng thái
  const tabButtons = document.querySelectorAll('.filter-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('bg-primary-container', 'text-on-primary', 'shadow-sm');
        b.classList.add('bg-surface-container-low', 'text-on-surface');
      });
      btn.classList.add('bg-primary-container', 'text-on-primary', 'shadow-sm');
      btn.classList.remove('bg-surface-container-low', 'text-on-surface');

      st.status = btn.dataset.status || 'all';
      st.page = 1;
      load();
    });
  });

  // 4. Bộ lọc Thể loại
  if ($('typeFilter')) {
    $('typeFilter').addEventListener('change', (e) => {
      st.kind = e.target.value === 'all' ? '' : e.target.value;
      st.page = 1;
      load();
    });
  }

  // 5. Ô tìm kiếm (Debounced)
  if ($('searchInput')) {
    $('searchInput').addEventListener('input', App.debounce((e) => {
      st.q = e.target.value.trim();
      st.page = 1;
      load();
    }, 350));
  }

  // 6. Dropdown Sắp xếp
  if ($('sortFilter')) {
    $('sortFilter').addEventListener('change', (e) => {
      st.sort = e.target.value;
      load();
    });
  }

  // Khởi động
  await updateStats();
  await load();
  App.watch('all', App.debounce(() => { updateStats(); load(); }, 800));
})();