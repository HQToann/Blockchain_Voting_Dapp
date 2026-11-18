/**
 * Logic điều khiển trang Hòm Phiếu Của Tôi (My Elections & Voting History)
 * Tích hợp Backend API Django, Smart Contract Sepolia & Web3 Ethers.js
 */
(async () => {
  await App.init();
  const $ = App.$;
  const esc = App.esc;

  const st = {
    tab: 'owner',
    page: 1,
    status: 'all',
    q: ''
  };

  let globalStats = {
    ownerTotal: 0,
    ownerOpen: 0,
    ownerEnded: 0,
    votedTotal: 0,
    recentVotedText: 'Chưa tham gia bỏ phiếu'
  };

  // 1. Tải số liệu thống kê tổng thể (Bento Stats) qua API /api/stats/ chuyên dụng
  async function loadBentoStats() {
    const me = App.state.address;
    if (!me) return;

    try {
        const stats = await App.api(`/api/stats/?address=${encodeURIComponent(me)}`);
        if (stats) {
          const u = stats.user || stats;
          globalStats.ownerTotal = u.owner_total != null ? u.owner_total : 0;
          globalStats.ownerOpen = u.owner_open != null ? u.owner_open : 0;
          globalStats.ownerEnded = u.owner_ended != null ? u.owner_ended : 0;
          globalStats.votedTotal = u.voted_total != null ? u.voted_total : 0;

          if ($('statCreatedTotal')) $('statCreatedTotal').textContent = globalStats.ownerTotal;
          if ($('statCreatedOpen')) $('statCreatedOpen').innerHTML = `<span class="w-2 h-2 rounded-full bg-tertiary-container"></span> ${globalStats.ownerOpen} đang mở`;
          if ($('statCreatedEnded')) $('statCreatedEnded').textContent = `• ${globalStats.ownerEnded} đã kết thúc`;
          if ($('statCreatedBar')) {
            const pct = globalStats.ownerTotal > 0 ? Math.round((globalStats.ownerOpen / globalStats.ownerTotal) * 100) : 0;
            $('statCreatedBar').style.width = `${pct}%`;
          }
          if ($('tabCountOwner')) $('tabCountOwner').textContent = globalStats.ownerTotal;

          if ($('statVotedTotal')) $('statVotedTotal').textContent = globalStats.votedTotal;
          if ($('tabCountVoted')) $('tabCountVoted').textContent = globalStats.votedTotal;

          const recentTime = u.recent_voted_time || stats.recent_voted_time;
          if (recentTime) {
            globalStats.recentVotedText = `Gần nhất: ${App.fmtDate(recentTime)}`;
          } else {
            globalStats.recentVotedText = 'Chưa tham gia bỏ phiếu';
          }

          if ($('statVotedRecent')) {
            $('statVotedRecent').innerHTML = `
            <span class="material-symbols-outlined text-[16px] text-tertiary">check_circle</span>
            <span class="truncate">${esc(globalStats.recentVotedText)}</span>
          `;
          }

          // Cập nhật số đếm trên các bộ lọc (Filter pills)
          if (st.tab === 'owner') {
            if ($('filterAllCount')) $('filterAllCount').textContent = globalStats.ownerTotal;
            if ($('filterOpenCount')) $('filterOpenCount').textContent = globalStats.ownerOpen;
            if ($('filterEndedCount')) $('filterEndedCount').textContent = globalStats.ownerEnded;
          } else if (st.tab === 'voted') {
            if ($('filterAllCount')) $('filterAllCount').textContent = globalStats.votedTotal;
          }

          // Cập nhật huy hiệu tổng trên Hero Title
          if ($('heroTotalBadge')) {
            $('heroTotalBadge').textContent = st.tab === 'owner' ? globalStats.ownerTotal : (st.tab === 'voted' ? globalStats.votedTotal : 0);
          }
        }
      } catch (err) {
        console.warn('Lỗi tải thống kê Bento:', err);
      }
      }

      function updateDraftCountInMy() {
        try {
          const drafts = JSON.parse(localStorage.getItem('votechain_election_drafts') || '[]');
          if ($('tabCountDrafts')) $('tabCountDrafts').textContent = drafts.length;
        } catch (_) { }
      }

      function loadDraftsTab() {
        const listEl = $('list');
        if (!listEl) return;

        let drafts = [];
        try {
          drafts = JSON.parse(localStorage.getItem('votechain_election_drafts') || '[]');
        } catch (_) { }

        if (st.q) {
          const query = st.q.toLowerCase();
          drafts = drafts.filter((d) => (d.name || '').toLowerCase().includes(query) || (d.description || '').toLowerCase().includes(query));
        }

        if ($('pager')) $('pager').innerHTML = '';
        if ($('paginationSummary')) $('paginationSummary').textContent = `${drafts.length} bản nháp`;
        if ($('heroTotalBadge')) $('heroTotalBadge').textContent = drafts.length;
        if ($('modePill')) $('modePill').textContent = 'Draft Mode';

        if (!drafts.length) {
          listEl.innerHTML = `
        <div class="col-span-full bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-4">
          <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-outline">
            <span class="material-symbols-outlined text-[36px]">drafts</span>
          </div>
          <div class="flex flex-col gap-1 max-w-md">
            <h3 class="font-headline-md text-headline-md text-on-surface font-bold">
              ${st.q ? 'Không tìm thấy bản nháp phù hợp' : 'Bạn chưa có bản nháp nào'}
            </h3>
            <p class="font-body-md text-on-surface-variant">
              ${st.q ? 'Thử tìm kiếm với từ khóa khác.' : 'Khi bạn tạo hòm phiếu và bấm "Lưu bản nháp", dữ liệu sẽ được lưu tại đây để tiếp tục chỉnh sửa bất cứ lúc nào.'}
            </p>
          </div>
          <div>
            <a href="/create/" class="px-space-lg py-3 rounded-xl bg-primary text-white font-headline-sm text-sm font-bold shadow-md hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-decoration-none">
              <span class="material-symbols-outlined text-[20px]">add_circle</span>
              Tạo hòm phiếu ngay
            </a>
          </div>
        </div>
      `;
          return;
        }

        listEl.innerHTML = drafts.map((d) => {
          const isProp = d.kind === 1;
          const count = d.options ? d.options.length : 0;
          const timeStr = App.fmtDate(new Date(d.updatedAt));

          return `
          <div class="rounded-2xl bg-surface-container-lowest p-space-lg shadow-sm hover:shadow-md hover:border-blue-300 transition-all flex flex-col justify-between space-y-space-md border border-slate-200/90 h-full">
            <div class="space-y-space-sm">
              <div class="flex items-center justify-between text-xs gap-2 min-w-0">
                <span class="px-2.5 py-0.5 rounded-full bg-amber-50 text-amber-800 font-semibold text-xs border border-amber-200 flex items-center gap-1.5 shrink-0">
                  <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                  Bản nháp cục bộ
                </span>
                <span class="font-label-code text-[11px] text-outline shrink-0 whitespace-nowrap">${timeStr}</span>
              </div>

              <div>
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="font-label-tag text-label-tag text-primary uppercase font-bold text-xs">
                    ${isProp ? 'LẤY Ý KIẾN CỘNG ĐỒNG' : 'BẦU CỬ ỨNG VIÊN'}
                  </span>
                  <span class="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[11px] font-semibold border border-slate-200">
                    ${d.isPrivate ? 'Riêng tư' : 'Công khai'}
                  </span>
                </div>
                <h4 class="font-headline-sm text-headline-sm text-on-surface font-bold mt-1 line-clamp-1">
                  ${esc(d.name || 'Hòm phiếu chưa đặt tên')}
                </h4>
                <p class="font-body-sm text-body-sm text-on-surface-variant line-clamp-2 mt-1">
                  ${esc(d.description) || 'Chưa có mô tả chi tiết.'}
                </p>
              </div>

              <div class="space-y-1 pt-1 font-body-sm text-xs text-on-surface-variant">
                <span>Gồm <b>${count}</b> lựa chọn đã thiết lập.</span>
              </div>
            </div>

            <div class="pt-space-sm border-t border-surface-container flex items-center gap-2">
              <a href="/create/?draftId=${d.id}" class="btn-card-action flex-1 py-2.5 rounded-xl bg-primary text-white font-headline-sm text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-blue-700 hover:shadow-md transition-all text-decoration-none shadow-sm">
                <span class="material-symbols-outlined text-[16px]">edit</span>
                <span>Chỉnh sửa</span>
              </a>
              <button type="button" class="btn-del-draft-my px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 text-xs font-semibold transition-all border border-slate-200 cursor-pointer flex items-center justify-center shrink-0" data-id="${d.id}" title="Xóa bản nháp này">
                <span class="material-symbols-outlined text-[16px]">delete</span>
              </button>
            </div>
          </div>
        `;
        }).join('');

        listEl.querySelectorAll('.btn-del-draft-my').forEach((b) => {
          b.addEventListener('click', () => {
            const id = b.dataset.id;
            if (confirm('Bạn có chắc chắn muốn xóa bản nháp này không?')) {
              let currentDrafts = [];
              try {
                currentDrafts = JSON.parse(localStorage.getItem('votechain_election_drafts') || '[]');
              } catch (_) { }
              currentDrafts = currentDrafts.filter((x) => x.id !== id);
              localStorage.setItem('votechain_election_drafts', JSON.stringify(currentDrafts));
              updateDraftCountInMy();
              loadDraftsTab();
              App.toast('Đã xóa bản nháp!', 'ok');
            }
          });
        });
      }

      // 2. Tải Danh Sách Hòm Phiếu (Hiển thị thẻ 3 cột tương tự Khám Phá)
      async function load() {
        const me = App.state.address;
        if (!me) return;

        if (st.tab === 'drafts') {
          loadDraftsTab();
          return;
        }

        const listEl = $('list');
        if (listEl) {
          listEl.innerHTML = `
        <div class="col-span-full bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-3">
          <span class="material-symbols-outlined text-primary text-[36px] animate-spin">progress_activity</span>
          <span class="font-body-md text-on-surface-variant">Đang tải danh sách hòm phiếu...</span>
        </div>
      `;
        }

        const p = new URLSearchParams({
          page: st.page,
          page_size: 9,
          status: st.status
        });
        p.set(st.tab === 'owner' ? 'owner' : 'voted', me);
        if (st.q) p.set('q', st.q);

        try {
          const d = await App.api('/api/elections/?' + p);

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
          if ($('btnResetSearch')) {
          $('btnResetSearch').addEventListener('click', resetMySearch);
        }

        if ($('clearSearchBtn')) {
            $('clearSearchBtn').classList.toggle('hidden', !st.q);
          }

          if (listEl) {
            if (d.elections && d.elections.length) {
              // Thẻ dạng card 3 cột chuẩn hóa đồng bộ với trang Khám Phá
              let html = d.elections.map((e) => Cards.card(e, me, st.tab === 'voted')).join('');
              if (st.tab === 'owner' && d.page >= d.pages && typeof Cards.createPromptCard === 'function') {
                html += Cards.createPromptCard();
              }
              listEl.innerHTML = html;
            } else {
              listEl.innerHTML = `
            <div class="col-span-full bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-outline">
                <span class="material-symbols-outlined text-[36px]">${st.tab === 'owner' ? 'ballot' : 'inbox'}</span>
              </div>
              <div class="flex flex-col gap-1 max-w-md">
                <h3 class="font-headline-md text-headline-md text-on-surface font-bold">
                  ${st.q ? 'Không tìm thấy cuộc bầu cử phù hợp' : (st.tab === 'owner' ? 'Bạn chưa tạo cuộc bầu cử nào.' : 'Bạn chưa tham gia bỏ phiếu trong cuộc bầu cử nào.')}
                </h3>
                <p class="font-body-md text-on-surface-variant">
                  ${st.q
                    ? `Không có hòm phiếu nào khớp với từ khóa "${esc(st.q)}".`
                    : (st.tab === 'owner'
                      ? 'Hãy khởi tạo cuộc bầu cử phi tập trung đầu tiên của bạn chỉ trong 3 bước đơn giản.'
                      : 'Hãy khám phá các cuộc bầu cử đang diễn ra để thực hiện quyền cử tri của mình.')}
                </p>
              </div>
              <div>
                ${st.tab === 'owner'
                  ? '<a href="/create/" class="px-space-lg py-3 rounded-xl bg-primary text-white font-headline-sm text-sm font-bold shadow-md hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-decoration-none"><span class="material-symbols-outlined text-[20px]">add_circle</span> Tạo hòm phiếu ngay</a>'
                  : '<a href="/" class="px-space-lg py-3 rounded-xl bg-primary text-white font-headline-sm text-sm font-bold shadow-md hover:bg-blue-700 transition-all inline-flex items-center gap-2 text-decoration-none"><span class="material-symbols-outlined text-[20px]">explore</span> Khám phá ngay</a>'
                }
              </div>
            </div>
          `;
            }
          }

          // Cập nhật số lượng trên các nút lọc khi lọc Tất cả
          if (st.status === 'all' && $('filterAllCount')) {
            $('filterAllCount').textContent = d.total || 0;
          }

          // Phân trang
          if ($('pager')) {
            Cards.pager($('pager'), d.page, d.pages, (n) => {
              st.page = n;
              load();
              const target = $('mine');
              if (target) target.scrollIntoView({ behavior: 'smooth' });
            });
          }

          // Cập nhật tóm tắt phân trang
          if ($('paginationSummary')) {
            const start = d.total > 0 ? Math.min(d.total, (d.page - 1) * d.page_size + 1) : 0;
            const end = Math.min(d.total, d.page * d.page_size);
            $('paginationSummary').innerHTML = d.total > 0
              ? `Hiển thị <span class="font-bold text-slate-900">${start} - ${end}</span> trên tổng số <span class="font-bold text-slate-900">${d.total}</span> hòm phiếu`
              : '0 hòm phiếu';
          }

        } catch (e) {
          if (listEl) {
            listEl.innerHTML = `
              <div class="col-span-full bg-red-50 border-l-4 border-error p-space-md rounded-2xl text-error font-body-md flex items-center gap-3">
                <span class="material-symbols-outlined text-error text-[28px]">warning</span>
                <span>${esc(e.message)}</span>
              </div>
            `;
          }
        }
      }

      // 3. Kiểm tra và Cập nhật Trạng Thái Giao Diện Theo Ví
      function show() {
        const me = App.state.address;
        const ok = !!me;

        if ($('needWallet')) $('needWallet').classList.toggle('hidden', ok);
        if ($('mine')) $('mine').classList.toggle('hidden', !ok);

        if ($('headerWalletBadge')) {
          $('headerWalletBadge').textContent = ok ? `Ví cử tri: ${App.short(me)}` : 'Chưa kết nối ví';
        }

        updateDraftCountInMy();

        if (ok) {
          loadBentoStats();
          load();
        }
      }

      // 4. Nút Kết Nối MetaMask trong Banner Need Wallet
      if ($('btnConnect')) {
          $('btnConnect').addEventListener('click', () => {
            App.connect().then(show).catch((e) => {
              if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error');
            });
          });
        }

        // 5. Chuyển Đổi Tab (Tôi đã tạo vs Tôi đã bỏ phiếu)
        document.querySelectorAll('.tab-btn').forEach((t) => {
          t.addEventListener('click', () => {
            document.querySelectorAll('.tab-btn').forEach((x) => {
              const active = x === t;
              x.classList.toggle('active', active);
              const badge = x.querySelector('.count-badge');
              if (active) {
                x.classList.add('active', 'text-white', 'bg-primary');
                x.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-200/70');
                if (badge) {
                  badge.classList.add('bg-white/20', 'text-white');
                  badge.classList.remove('bg-slate-200', 'text-slate-700', 'bg-blue-100', 'text-blue-700');
                }
              } else {
                x.classList.remove('active', 'text-white', 'bg-primary');
                x.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-200/70');
                if (badge) {
                  badge.classList.remove('bg-white/20', 'text-white');
                  badge.classList.add('bg-slate-200', 'text-slate-700');
                }
              }
            });

            st.tab = t.dataset.tab;
            st.page = 1;

            // Cập nhật Mode Pill
            if ($('modePill')) {
              $('modePill').textContent = st.tab === 'owner' ? 'Creator Mode' : 'Voter Mode';
            }

            // Cập nhật badge số lượng trên Hero
            if ($('heroTotalBadge')) {
              $('heroTotalBadge').textContent = st.tab === 'owner' ? globalStats.ownerTotal : globalStats.votedTotal;
            }

            load();
          });
        });

        // 6. Bộ Lọc Trạng Thái (All / Open / Ended)
        document.querySelectorAll('.filter-pill').forEach((btn) => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-pill').forEach((b) => {
              const active = b === btn;
              const badge = b.querySelector('.count-badge');
              if (active) {
                b.classList.add('active', 'text-white', 'bg-primary');
                b.classList.remove('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-200/70');
                if (badge) {
                  badge.classList.add('bg-white/20', 'text-white');
                  badge.classList.remove('bg-slate-200', 'text-slate-700');
                }
              } else {
                b.classList.remove('active', 'text-white', 'bg-primary');
                b.classList.add('text-slate-600', 'hover:text-slate-900', 'hover:bg-slate-200/70');
                if (badge) {
                  badge.classList.remove('bg-white/20', 'text-white');
                  badge.classList.add('bg-slate-200', 'text-slate-700');
                }
              }
            });

            st.status = btn.dataset.status;
            st.page = 1;
            load();
          });
        });

        // 7. Tìm Kiếm (Search Bar Debounced & Instant Clear)
        function resetMySearch() {
          st.q = '';
          st.page = 1;
          if ($('searchInput')) $('searchInput').value = '';
          if ($('clearSearchBtn')) $('clearSearchBtn').classList.add('hidden');
          load();
        }

        if ($('btnResetSearch')) {
          $('btnResetSearch').addEventListener('click', resetMySearch);
        }

        if ($('clearSearchBtn')) {
          $('clearSearchBtn').addEventListener('click', resetMySearch);
        }

        if ($('searchInput')) {
          $('searchInput').addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if ($('clearSearchBtn')) $('clearSearchBtn').classList.toggle('hidden', !val);
          });

          $('searchInput').addEventListener('input', App.debounce((e) => {
            st.q = e.target.value.trim();
            st.page = 1;
            load();
          }, 350));

          $('searchInput').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              st.q = e.target.value.trim();
              st.page = 1;
              load();
            }
          });
        }

        show();
        window.addEventListener('app:wallet', show);
        App.watch('all', App.debounce(() => App.state.address && (loadBentoStats(), load()), 800));
      }) ();
