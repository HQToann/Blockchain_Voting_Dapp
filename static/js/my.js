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
          globalStats.ownerTotal = stats.owner_total || 0;
          globalStats.ownerOpen = stats.owner_open || 0;
          globalStats.ownerEnded = stats.owner_ended || 0;
          globalStats.votedTotal = stats.voted_total || 0;

          if ($('statCreatedTotal')) $('statCreatedTotal').textContent = String(globalStats.ownerTotal).padStart(2, '0');
          if ($('statCreatedOpen')) $('statCreatedOpen').innerHTML = `<span class="w-2 h-2 rounded-full bg-tertiary-container"></span> ${globalStats.ownerOpen} đang mở`;
          if ($('statCreatedEnded')) $('statCreatedEnded').textContent = `• ${globalStats.ownerEnded} đã kết thúc`;
          if ($('statCreatedBar')) {
            const pct = globalStats.ownerTotal > 0 ? Math.round((globalStats.ownerOpen / globalStats.ownerTotal) * 100) : 0;
            $('statCreatedBar').style.width = `${pct}%`;
          }
          if ($('tabCountOwner')) $('tabCountOwner').textContent = globalStats.ownerTotal;

          if ($('statVotedTotal')) $('statVotedTotal').textContent = String(globalStats.votedTotal).padStart(2, '0');
          if ($('tabCountVoted')) $('tabCountVoted').textContent = globalStats.votedTotal;

            if (stats.recent_voted_time) {
              globalStats.recentVotedText = `Gần nhất: ${App.fmtDate(stats.recent_voted_time)}`;
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
        if ($('heroTotalBadge')) $('heroTotalBadge').textContent = drafts.length;
        if ($('modePill')) $('modePill').textContent = 'Draft Mode';

        if (!drafts.length) {
          listEl.innerHTML = `
        <div class="bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-4">
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
            <a href="/create/" class="px-space-lg py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-md hover:bg-primary transition-all inline-flex items-center gap-2">
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
        <div class="p-space-lg rounded-2xl bg-surface-container-lowest border border-surface-container-high/70 hover:border-primary/50 shadow-sm transition-all flex flex-col md:flex-row items-start md:items-center justify-between gap-space-md">
          <div class="space-y-2 flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-3 py-1 rounded-full font-label-tag text-xs font-bold uppercase ${isProp ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-primary-fixed text-on-primary-fixed'}">
                ${isProp ? 'Biểu quyết' : 'Bầu cử'}
              </span>
              <span class="px-3 py-1 rounded-full font-label-tag text-xs font-semibold bg-surface-container-high text-on-surface-variant">
                ${d.isPrivate ? 'Riêng tư (Whitelist)' : 'Công khai'}
              </span>
              <span class="px-3 py-1 rounded-full font-label-tag text-xs font-semibold bg-surface-container-high text-on-surface-variant">
                ${count} lựa chọn
              </span>
              <span class="px-3 py-1 rounded-full font-label-tag text-xs font-bold bg-amber-100 text-amber-900 border border-amber-300">
                Bản nháp cục bộ
              </span>
            </div>

            <h3 class="font-headline-md text-headline-md text-on-surface font-bold truncate">
              ${App.esc(d.name)}
            </h3>

            <p class="font-body-md text-sm text-on-surface-variant line-clamp-2">
              ${App.esc(d.description) || 'Chưa có mô tả chi tiết.'}
            </p>

            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-body-sm text-xs text-on-surface-variant pt-1">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-[15px]">schedule</span>
                Lưu lúc: <strong class="text-on-surface font-label-code">${timeStr}</strong>
              </span>
              <span>•</span>
              <span class="text-amber-700 font-semibold">Chưa đưa lên Blockchain Sepolia</span>
            </div>
          </div>

          <div class="flex items-center gap-2 self-end md:self-center shrink-0">
            <a href="/create/?draftId=${d.id}" class="px-space-md py-2.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-sm font-bold shadow-xs hover:bg-primary transition-all flex items-center gap-1.5 cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">edit</span>
              Tiếp tục chỉnh sửa
            </a>
            <button type="button" class="btn-del-draft-my px-3 py-2.5 rounded-xl bg-surface-container-low hover:bg-red-50 text-on-surface-variant hover:text-error font-headline-sm text-sm font-semibold transition-all flex items-center gap-1 cursor-pointer border border-surface-container-high" data-id="${d.id}" title="Xóa bản nháp này">
              <span class="material-symbols-outlined text-[18px]">delete</span>
              Xóa
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

      // 2. Tải Danh Sách Hòm Phiếu
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
        <div class="bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-3">
          <span class="material-symbols-outlined text-primary text-[36px] animate-spin">progress_activity</span>
          <span class="font-body-md text-on-surface-variant">Đang tải danh sách hòm phiếu...</span>
        </div>
      `;
        }

        const p = new URLSearchParams({
          page: st.page,
          page_size: 10,
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

          if (listEl) {
            if (d.elections && d.elections.length) {
              // Sử dụng ElectionCards.myCard từ cards.js
              listEl.innerHTML = d.elections.map((e) => Cards.myCard(e, me, st.tab === 'voted')).join('');

              // Gắn sự kiện sao chép mã contract
              listEl.querySelectorAll('.btn-copy').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                  ev.stopPropagation();
                  const val = btn.dataset.copy;
                  navigator.clipboard?.writeText(val);
                  App.toast('Đã sao chép địa chỉ Contract!', 'ok', 2000);
                });
              });

              // Gắn sự kiện chia sẻ link
              listEl.querySelectorAll('.btn-share').forEach((btn) => {
                btn.addEventListener('click', (ev) => {
                  ev.stopPropagation();
                  const url = btn.dataset.url;
                  navigator.clipboard?.writeText(url);
                  App.toast('Đã sao chép liên kết chia sẻ bầu cử vào bộ nhớ tạm!', 'ok', 2500);
                });
              });

            } else {
              listEl.innerHTML = `
            <div class="bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-4">
              <div class="w-16 h-16 rounded-2xl bg-surface-container flex items-center justify-center text-outline">
                <span class="material-symbols-outlined text-[36px]">${st.tab === 'owner' ? 'ballot' : 'inbox'}</span>
              </div>
              <div class="flex flex-col gap-1 max-w-md">
                <h3 class="font-headline-md text-headline-md text-on-surface font-bold">
                  ${st.tab === 'owner' ? 'Bạn chưa tạo cuộc bầu cử nào.' : 'Bạn chưa tham gia bỏ phiếu trong cuộc bầu cử nào.'}
                </h3>
                <p class="font-body-md text-on-surface-variant">
                  ${st.tab === 'owner'
                  ? 'Hãy khởi tạo cuộc bầu cử phi tập trung đầu tiên của bạn chỉ trong 3 bước đơn giản.'
                  : 'Hãy khám phá các cuộc bầu cử đang diễn ra để thực hiện quyền cử tri của mình.'}
                </p>
              </div>
              <div>
                ${st.tab === 'owner'
                  ? '<a href="/create/" class="px-space-lg py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-md hover:bg-primary transition-all inline-flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">add_circle</span> Tạo hòm phiếu ngay</a>'
                  : '<a href="/" class="px-space-lg py-3 rounded-xl bg-primary-container text-on-primary font-headline-sm text-headline-sm font-bold shadow-md hover:bg-primary transition-all inline-flex items-center gap-2"><span class="material-symbols-outlined text-[20px]">explore</span> Khám phá ngay</a>'
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
                window.scrollTo({ top: 0, behavior: 'smooth' });
              });
            }

    } catch (e) {
            if (listEl) {
              listEl.innerHTML = `
          <div class="bg-red-50 border-l-4 border-error p-space-md rounded-2xl text-error font-body-md flex items-center gap-3">
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
              x.className = active
                ? 'tab-btn active inline-flex items-center gap-2 px-space-md py-2.5 rounded-xl bg-surface-container-lowest text-primary font-headline-sm text-headline-sm font-bold shadow-sm whitespace-nowrap transition-all cursor-pointer'
                : 'tab-btn inline-flex items-center gap-2 px-space-md py-2.5 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container/60 font-headline-sm text-headline-sm font-medium whitespace-nowrap transition-all cursor-pointer';
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
              b.className = active
                ? 'filter-pill active px-3.5 py-2 rounded-xl bg-primary text-on-primary font-headline-sm text-headline-sm text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer'
                : 'filter-pill px-3.5 py-2 rounded-xl bg-surface-container-low text-on-surface-variant hover:text-on-surface font-headline-sm text-headline-sm text-xs font-medium whitespace-nowrap transition-colors cursor-pointer';
            });

            st.status = btn.dataset.status;
            st.page = 1;
            load();
          });
        });

        // 7. Tìm Kiếm (Search Bar Debounced)
        if ($('searchInput')) {
          $('searchInput').addEventListener('input', App.debounce((e) => {
            st.q = e.target.value.trim();
            st.page = 1;
            load();
          }, 400));
        }

        show();
        App.watch('all', App.debounce(() => App.state.address && (loadBentoStats(), load()), 800));
      }) ();
