(async () => {
  await App.init();
  const st = { status: 'all', kind: '', q: '', page: 1, sort: 'newest' };
  const $ = App.$;

  // Đọc từ khóa tìm kiếm ban đầu từ URL nếu có (?q=...)
  const urlParams = new URLSearchParams(window.location.search);
  const initialQ = urlParams.get('q');
  if (initialQ) {
    st.q = initialQ.trim();
    if ($('searchInput')) $('searchInput').value = st.q;
    if ($('clearSearchBtn')) $('clearSearchBtn').classList.remove('hidden');
  }

  // 1. Thống kê dữ liệu thực từ hệ thống Backend (sử dụng API /api/stats/ chuyên dụng)
  async function updateStats() {
    try {
      const s = await App.api('/api/stats/');
      if (!s) return;

      const totalElections = s.total_elections || 0;
      const openCount = s.open_elections || 0;
      const totalVotes = s.total_votes || 0;
      const totalVoters = s.total_voters || 0;

      // Cập nhật các ô số liệu thống kê Hero
      if ($('statTotalVotes')) $('statTotalVotes').textContent = totalVotes.toLocaleString('vi-VN');
      if ($('statTotalElections')) $('statTotalElections').textContent = `${totalElections} hòm`;
      if ($('statOpenElections')) $('statOpenElections').textContent = `${openCount} đang mở`;
      if ($('statTotalVoters')) $('statTotalVoters').textContent = totalVoters.toLocaleString('vi-VN');

      // Cập nhật số đếm trên các Tab trạng thái
      if ($('tabCountAll')) $('tabCountAll').textContent = `(${totalElections})`;
      if ($('tabCountOpen')) $('tabCountOpen').textContent = `(Live - ${openCount})`;
      if ($('tabCountUpcoming')) $('tabCountUpcoming').textContent = `(${s.upcoming_elections || 0})`;
      if ($('tabCountEnded')) $('tabCountEnded').textContent = `(${s.ended_elections || 0})`;
    } catch (err) {
      console.warn('Lỗi cập nhật thống kê:', err);
    }
  }

  // 2. Tải danh sách hòm phiếu thật từ API
  async function load() {
    const p = new URLSearchParams({ status: st.status, page: st.page, page_size: 10 });
    if (st.kind) p.set('kind', st.kind);
    if (st.q) p.set('q', st.q);
    if (st.sort) p.set('sort', st.sort);

    try {
      const d = await App.api('/api/elections/?' + p);
      if ($('syncWarning')) $('syncWarning').classList.toggle('hidden', !d.indexer.lagging);

      const Cards = window.ElectionCards;
      if (!Cards) {
        throw new Error('Thư viện giao diện (cards.js) chưa sẵn sàng. Vui lòng tải lại trang.');
      }

      // Cập nhật thanh phản hồi kết quả tìm kiếm (Search Feedback Banner)
      if ($('searchFeedback')) {
        if (st.q) {
          $('searchFeedback').classList.remove('hidden');
          if ($('searchFeedbackQuery')) $('searchFeedbackQuery').textContent = st.q;
          if ($('searchFeedbackCount')) $('searchFeedbackCount').textContent = (d.total || 0).toLocaleString('vi-VN');
        } else {
          $('searchFeedback').classList.add('hidden');
        }
      }

      // Cập nhật hiển thị nút xóa nhanh trên ô input
      if ($('clearSearchBtn')) {
        $('clearSearchBtn').classList.toggle('hidden', !st.q);
      }

      const listEl = $('electionGrid');
      if (listEl) {
        if (!d.elections || d.elections.length === 0) {
          if (st.q) {
            listEl.innerHTML = `
              <div class="col-span-full py-14 px-6 text-center bg-surface-container-lowest rounded-2xl border border-dashed border-outline-variant/60 shadow-sm">
                <div class="w-16 h-16 rounded-full bg-surface-container-high flex items-center justify-center mx-auto mb-4 text-outline">
                  <span class="material-symbols-outlined text-[32px]">search_off</span>
                </div>
                <h3 class="font-headline-sm text-headline-sm text-on-surface font-bold">Không tìm thấy cuộc bầu cử phù hợp</h3>
                <p class="font-body-sm text-body-sm text-on-surface-variant max-w-md mx-auto mt-2 mb-5">
                  Không có hòm phiếu nào khớp với từ khóa "<strong class="text-primary font-bold">${App.esc(st.q)}</strong>". Hãy thử kiểm tra lại chính tả hoặc tìm theo mã hòm phiếu #ID / địa chỉ ví.
                </p>
                <button type="button" id="btnEmptyResetSearch" class="inline-flex items-center gap-2 px-space-lg py-2.5 rounded-xl bg-primary text-white font-headline-sm text-sm shadow-sm hover:opacity-95 transition-all cursor-pointer border-0">
                  <span class="material-symbols-outlined text-[18px]">restart_alt</span> Xóa tìm kiếm &amp; Xem tất cả
                </button>
              </div>`;
            const emptyReset = $('btnEmptyResetSearch');
            if (emptyReset) {
              emptyReset.addEventListener('click', resetSearch);
            }
          } else {
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
          }
        } else {
          let html = d.elections.map((e) => Cards.card(e, App.state.address)).join('');
          // Gợi ý tạo hòm phiếu mới nằm ở ô cuối cùng của lưới khi người dùng đã xem hết tất cả các hòm phiếu (ở trang cuối)
          if (d.page >= d.pages && typeof Cards.createPromptCard === 'function') {
            html += Cards.createPromptCard();
          }
          listEl.innerHTML = html;
        }
      }

      // Phân trang
      if ($('pager')) {
        Cards.pager($('pager'), d.page, d.pages, (n) => {
          st.page = n;
          load();
          const target = $('explore-ballots');
          if (target) target.scrollIntoView({ behavior: 'smooth' });
        });
      }

      if ($('paginationSummary')) {
        const start = d.total > 0 ? Math.min(d.total, (d.page - 1) * d.page_size + 1) : 0;
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

  // 3. Hàm đặt lại tìm kiếm về ban đầu
  function resetSearch() {
    st.q = '';
    st.page = 1;
    if ($('searchInput')) $('searchInput').value = '';
    if ($('clearSearchBtn')) $('clearSearchBtn').classList.add('hidden');
    if ($('searchFeedback')) $('searchFeedback').classList.add('hidden');
    load();
  }

  // 4. Bắt sự kiện chuyển Tab trạng thái
  const tabButtons = document.querySelectorAll('#statusChips .chip, .filter-tab-btn');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => {
        b.classList.remove('active');
      });
      btn.classList.add('active');

      st.status = btn.dataset.status || 'all';
      st.page = 1;
      load();
    });
  });

  // 5. Bộ lọc Thể loại
  if ($('typeFilter')) {
    $('typeFilter').addEventListener('change', (e) => {
      st.kind = e.target.value === 'all' ? '' : e.target.value;
      st.page = 1;
      load();
    });
  }

  // 6. Ô tìm kiếm & Nút điều khiển tìm kiếm
  if ($('clearSearchBtn')) {
    $('clearSearchBtn').addEventListener('click', resetSearch);
  }

  if ($('btnResetSearch')) {
    $('btnResetSearch').addEventListener('click', resetSearch);
  }

  if ($('btnSearchSubmit')) {
    $('btnSearchSubmit').addEventListener('click', () => {
      const q = ($('searchInput')?.value || '').trim();
      st.q = q;
      st.page = 1;
      load();
    });
  }

  if ($('searchInput')) {
    // Ẩn/hiện nút X ngay khi gõ
    $('searchInput').addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if ($('clearSearchBtn')) {
        $('clearSearchBtn').classList.toggle('hidden', !val);
      }
    });

    // Tìm kiếm tự động (Debounced 300ms)
    $('searchInput').addEventListener('input', App.debounce((e) => {
      st.q = e.target.value.trim();
      st.page = 1;
      load();
    }, 300));

    // Nhấn Enter tìm kiếm tức thì
    $('searchInput').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        st.q = e.target.value.trim();
        st.page = 1;
        load();
      }
    });
  }

  // 7. Gợi ý tìm kiếm nhanh (Quick search pills)
  document.querySelectorAll('.quick-search-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const q = tag.dataset.query || tag.textContent.trim();
      if ($('searchInput')) $('searchInput').value = q;
      if ($('clearSearchBtn')) $('clearSearchBtn').classList.remove('hidden');
      st.q = q;
      st.page = 1;
      load();
    });
  });

  // 8. Dropdown Sắp xếp
  if ($('sortFilter')) {
    $('sortFilter').addEventListener('change', (e) => {
      st.sort = e.target.value;
      st.page = 1;
      load();
    });
  }

  // Khởi động
  await updateStats();
  await load();
  App.watch('all', App.debounce(() => { updateStats(); load(); }, 800));
})();
