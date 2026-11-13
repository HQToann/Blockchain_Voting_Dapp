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

  // 1. Tải số liệu thống kê tổng thể (Bento Stats)
  async function loadBentoStats() {
    const me = App.state.address;
    if (!me) return;

    try {
      // 1.1 Thống kê hòm phiếu đã tạo
      const ownerRes = await App.api(`/api/elections/?owner=${encodeURIComponent(me)}&page_size=100`);
      if (ownerRes) {
        globalStats.ownerTotal = ownerRes.total || 0;
        let openCount = 0;
        let endedCount = 0;

        (ownerRes.elections || []).forEach((e) => {
          if (e.status === 'open') openCount++;
          else if (e.status === 'ended' || e.status === 'closed') endedCount++;
        });

        globalStats.ownerOpen = openCount;
        globalStats.ownerEnded = endedCount;

        if ($('statCreatedTotal')) $('statCreatedTotal').textContent = String(globalStats.ownerTotal).padStart(2, '0');
        if ($('statCreatedOpen')) $('statCreatedOpen').innerHTML = `<span class="w-2 h-2 rounded-full bg-tertiary-container"></span> ${openCount} đang mở`;
        if ($('statCreatedEnded')) $('statCreatedEnded').textContent = `• ${endedCount} đã kết thúc`;
        if ($('statCreatedBar')) {
          const pct = globalStats.ownerTotal > 0 ? Math.round((openCount / globalStats.ownerTotal) * 100) : 0;
          $('statCreatedBar').style.width = `${pct}%`;
        }
        if ($('tabCountOwner')) $('tabCountOwner').textContent = globalStats.ownerTotal;
      }

      // 1.2 Thống kê lá phiếu đã tham gia
      const votedRes = await App.api(`/api/elections/?voted=${encodeURIComponent(me)}&page_size=100`);
      if (votedRes) {
        globalStats.votedTotal = votedRes.total || 0;
        if ($('statVotedTotal')) $('statVotedTotal').textContent = String(globalStats.votedTotal).padStart(2, '0');
        if ($('tabCountVoted')) $('tabCountVoted').textContent = globalStats.votedTotal;

        if (votedRes.elections && votedRes.elections.length) {
          const first = votedRes.elections[0];
          globalStats.recentVotedText = `Gần nhất: ${App.fmtDate(first.created_at)}`;
        } else {
          globalStats.recentVotedText = 'Chưa tham gia bỏ phiếu';
        }

        if ($('statVotedRecent')) {
          $('statVotedRecent').innerHTML = `
            <span class="material-symbols-outlined text-[16px] text-tertiary">check_circle</span>
            <span class="truncate">${esc(globalStats.recentVotedText)}</span>
          `;
        }
      }

      // Cập nhật huy hiệu tổng trên Hero Title
      if ($('heroTotalBadge')) {
        $('heroTotalBadge').textContent = st.tab === 'owner' ? globalStats.ownerTotal : globalStats.votedTotal;
      }

    } catch (err) {
      console.warn('Lỗi tải thống kê Bento:', err);
    }
  }

  // 2. Tải Danh Sách Hòm Phiếu
  async function load() {
    const me = App.state.address;
    if (!me) return;

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

      if (listEl) {
        if (d.elections && d.elections.length) {
          // Sử dụng ElectionCards.myCard từ cards.js
          listEl.innerHTML = d.elections.map((e) => ElectionCards.myCard(e, me, st.tab === 'voted')).join('');

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

      // Cập nhật số lượng trên các nút lọc (filter pills)
      if ($('filterAllCount')) $('filterAllCount').textContent = d.total || 0;

      // Phân trang
      if ($('pager')) {
        ElectionCards.pager($('pager'), d.page, d.pages, (n) => {
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
})();
