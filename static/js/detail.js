/**
 * Logic điều khiển giao diện Chi Tiết Hòm Phiếu Bầu Cử (Detail Page)
 * Tích hợp ABI Smart Contract (Election.sol), API Backend Django, IPFS & Web3 Ethers.js
 */
(async () => {
  await App.init();
  const $ = App.$;
  const Cards = window.ElectionCards || {};
  const ADDR = location.pathname.split('/').filter(Boolean)[1];
  const isNew = new URLSearchParams(location.search).get('new') === '1';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const WL_CHUNK = 100;

  let E = null;
  let skew = 0;
  const selected = new Set();
  let elig = { connected: false };
  let myChoices = null;
  let lastLive = null, activeTab = 'results';
  const pages = { voters: 1, whitelist: 1 };

  // ---------------------------------------------------------------- 1. Tải dữ liệu hòm phiếu
  async function loadElection() {
    const d = await App.api(`/api/elections/${ADDR}/`);
    E = d;
    skew = Date.parse(d.server_time) - Date.now();
    return d;
  }

  function liveStatus() {
    if (!E) return 'open';
    if (E.status === 'closed') return 'closed';
    const now = Date.now() + skew;
    if (now < Date.parse(E.start_time)) return 'upcoming';
    if (E.end_time && now >= Date.parse(E.end_time)) return 'ended';
    return 'open';
  }

  async function refreshEligibility() {
    const me = App.state.address;
    if (!me) { elig = { connected: false }; return; }
    try {
      const c = App.electionContract(ADDR, App.state.provider);
      const [voted, whitelisted, st] = await Promise.all([
        c.hasVoted(me),
        E.is_private ? c.whitelist(me) : Promise.resolve(true),
        c.status()
      ]);
      elig = { connected: true, voted, whitelisted, chainStatus: Number(st) };
      if (voted) {
        try {
          const v = await App.api(`/api/elections/${ADDR}/voters/?voter=${me}`);
          if (v && v.votes && v.votes.length) {
            myChoices = v.votes[0];
            try {
              localStorage.setItem(`vote_${ADDR.toLowerCase()}_${me.toLowerCase()}`, JSON.stringify(myChoices));
            } catch (_) {}
          }
        } catch (_) {}
        if (!myChoices) {
          try {
            const raw = localStorage.getItem(`vote_${ADDR.toLowerCase()}_${me.toLowerCase()}`);
            if (raw) myChoices = JSON.parse(raw);
          } catch (_) {}
        }
        if (!myChoices) {
          try {
            const filter = c.filters.VoteCast(me);
            const events = await c.queryFilter(filter, -10000);
            if (events && events.length) {
              const lastEvt = events[events.length - 1];
              const rawChoices = lastEvt.args.choices || lastEvt.args[1];
              const choices = Array.from(rawChoices).map(Number);
              myChoices = {
                voter: me,
                choices: choices,
                choice_labels: choices.map((id) => E.options.find((o) => o.id === id)?.label || `#${id}`),
                tx_hash: lastEvt.transactionHash
              };
              try {
                localStorage.setItem(`vote_${ADDR.toLowerCase()}_${me.toLowerCase()}`, JSON.stringify(myChoices));
              } catch (_) {}
            }
          } catch (_) {}
        }
      }
    } catch (e) {
      elig = { connected: true, error: App.errMsg(e) };
    }
  }

  async function refreshAll() {
    try { await loadElection(); } catch (_) { return; }
    await refreshEligibility();
    render();
    if (activeTab === 'voters') loadVoters();
    if (activeTab === 'whitelist') loadWhitelist();
  }

  // ---------------------------------------------------------------- 3. Hiển thị Giao diện chính (Render)
  function render() {
    const live = liveStatus();
    lastLive = live;
    document.title = `${E.name} — VoteChain`;
    const isOwner = App.sameAddr(App.state.address, E.owner);

    if ($('crumbTitle')) $('crumbTitle').textContent = E.name;
    if ($('syncWarning')) $('syncWarning').classList.toggle('hidden', !E.indexer.lagging);

    // Render Badges bằng Cards
    $('badges').innerHTML = Cards.detailBadges ? Cards.detailBadges(E, live, isOwner) : '';

    const explorerUrl = App.cfg.explorer_url || 'https://sepolia.etherscan.io';

    // Contract box trên góc phải
    if ($('contractBox')) {
      $('contractBox').innerHTML = `
        <span class="text-slate-400">Contract:</span>
        <a href="${explorerUrl}/address/${E.address}" target="_blank" rel="noopener" class="font-bold text-blue-600 hover:underline" title="Xem trên Etherscan">${App.short(E.address)}</a>
        <button type="button" onclick="navigator.clipboard.writeText('${E.address}'); App.toast('Đã sao chép địa chỉ contract!', 'info');" class="border-0 bg-transparent text-slate-400 hover:text-blue-600 cursor-pointer p-0.5 flex items-center" title="Sao chép địa chỉ">
          <span class="material-symbols-outlined text-[14px]">content_copy</span>
        </button>
        <a href="${explorerUrl}/address/${E.address}" target="_blank" rel="noopener" class="text-slate-400 hover:text-blue-600 flex items-center p-0.5" title="Mở trên Etherscan">
          <span class="material-symbols-outlined text-[14px]">open_in_new</span>
        </a>
      `;
    }

    // Tiêu đề & Thông tin tác giả
    $('title').textContent = E.name;
    $('desc').textContent = E.description || 'Cuộc bầu cử phi tập trung được bảo đảm toàn vẹn và bất biến trên sổ cái chuỗi khối Ethereum Sepolia.';

    $('metaLine').innerHTML = `
      <span class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[15px] text-slate-400">account_circle</span>
        <span>Chủ hòm phiếu: <a href="${explorerUrl}/address/${E.owner}" target="_blank" rel="noopener" class="font-mono text-blue-600 font-semibold hover:underline">${App.short(E.owner)}</a></span>
      </span>
      <span class="text-slate-300">•</span>
      <span class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[15px] text-slate-400">calendar_today</span>
        <span>Khởi tạo: ${App.fmtDate(E.created_at)}</span>
      </span>
      <span class="text-slate-300">•</span>
      <span class="inline-flex items-center gap-1 text-slate-500 font-mono text-[11px]">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
        <span>Sepolia Testnet</span>
      </span>
    `;

    // Quy chế và Thống kê nhanh
    const k = E.max_choices;
    const optNoun = E.kind === 1 ? 'phương án' : 'ứng viên';
    if ($('ruleValue')) {
      $('ruleValue').textContent = k === 1
        ? `Chọn đúng 1 ${optNoun}`
        : `Chọn 1 đến ${k} ${optNoun}`;
    }
    if ($('ruleBox')) {
      $('ruleBox').textContent = k === 1 ? `Chọn đúng 1 ${optNoun}` : `Chọn 1 đến ${k} ${optNoun}`;
    }

    $('statTotalVoters').textContent = E.is_private
      ? `${E.whitelist_count || 0} ví Whitelist`
      : 'Cộng đồng mở';
    $('statVotedCount').textContent = `${E.total_voters} phiếu`;

    // Tiêu đề khu vực ứng viên
    $('optSectionTitle').textContent = `Danh sách ${optNoun} (${E.options.length})`;
    $('optSectionRule').textContent = k === 1
      ? `Chọn 1 ${optNoun} duy nhất để ký ủy quyền`
      : `Chọn từ 1 đến ${k} ${optNoun}`;

    renderVoteCard(live);
    renderResults();
    renderOwner(live, isOwner);
    $('tabWl').classList.toggle('hidden', !E.is_private);
    updateCountdown();
  }

  // ---------------------------------------------------------------- 4. Đồng hồ đếm ngược thời gian thực
  function updateCountdown() {
    if (!E) return;
    const now = Date.now() + skew, live = liveStatus();
    let targetTime = null;
    let label = 'Thời gian còn lại:';
    let sub = '';

    if (live === 'upcoming') {
      targetTime = Date.parse(E.start_time);
      label = 'Bắt đầu sau:';
      sub = `Mở lúc: ${App.fmtDate(E.start_time)}`;
    } else if (live === 'open') {
      if (E.end_time) {
        targetTime = Date.parse(E.end_time);
        label = 'Thời gian còn lại:';
        sub = `Kết thúc: ${App.fmtDate(E.end_time)}`;
      } else {
        label = 'Thời hạn bỏ phiếu:';
        sub = 'Không giới hạn thời gian (Vô thời hạn)';
      }
    } else if (live === 'closed') {
      label = 'Trạng thái:';
      sub = 'Chủ hòm phiếu đã đóng sớm';
    } else {
      label = 'Trạng thái:';
      sub = `Đã kết thúc lúc: ${App.fmtDate(E.end_time)}`;
    }

    if ($('countdownLabel')) {
      $('countdownLabel').innerHTML = `
        <span class="material-symbols-outlined text-[16px] text-primary">timer</span>
        ${label}
      `;
    }

    if ($('countdown')) {
      $('countdown').textContent = sub;
    }

    // Tính toán ngày, giờ, phút, giây
    let days = 0, hours = 0, mins = 0, secs = 0;
    if (targetTime) {
      const diff = Math.max(0, targetTime - now);
      const totalSec = Math.floor(diff / 1000);
      days = Math.floor(totalSec / 86400);
      hours = Math.floor((totalSec % 86400) / 3600);
      mins = Math.floor((totalSec % 3600) / 60);
      secs = totalSec % 60;
    }

    const pad = (n) => String(n).padStart(2, '0');
    if ($('cdDays')) $('cdDays').textContent = pad(days);
    if ($('cdHours')) $('cdHours').textContent = pad(hours);
    if ($('cdMins')) $('cdMins').textContent = pad(mins);
    if ($('cdSecs')) $('cdSecs').textContent = pad(secs);

    if (lastLive !== null && live !== lastLive) refreshAll();
  }

  // ---------------------------------------------------------------- 5. Render Thẻ Ứng Viên & Trạng Thái Bỏ Phiếu
  function renderVoteCard(live) {
    const box = $('voteStatus'), me = App.state.address;
    const open = elig.connected && elig.chainStatus !== undefined ? elig.chainStatus === 1 : live === 'open';
    let canPick = false, msg = '';

    if (!open) {
      msg = live === 'upcoming'
        ? `
          <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-xl flex items-center gap-2 text-amber-900 font-body-sm shadow-xs">
            <span class="material-symbols-outlined text-amber-600 text-[20px]">schedule</span>
            <span>Hòm phiếu chưa mở thời gian tiếp nhận phiếu bầu.</span>
          </div>
        `
        : `
          <div class="bg-surface-container-low border-l-4 border-outline p-3 rounded-xl flex items-center gap-2 text-on-surface-variant font-body-sm">
            <span class="material-symbols-outlined text-outline text-[20px]">lock</span>
            <span>Hòm phiếu đã chính thức kết thúc tiếp nhận biểu quyết.</span>
          </div>
        `;
    } else if (!me) {
      msg = `
        <div class="bg-primary/5 border border-primary/20 p-3 rounded-xl flex items-center justify-between gap-2">
          <span class="font-body-sm text-on-surface">Vui lòng kết nối ví để kiểm tra quyền và bỏ phiếu.</span>
          <button id="btnConn2" type="button" class="px-3 py-1.5 rounded-lg bg-primary-container text-on-primary font-headline-sm text-body-sm font-bold flex items-center gap-1 shadow-xs hover:bg-primary transition-all cursor-pointer">
            <span class="material-symbols-outlined text-[16px]">account_balance_wallet</span>
            Kết nối ví
          </button>
        </div>
      `;
    } else if (elig.error) {
      msg = `
        <div class="bg-red-50 border-l-4 border-error p-3 rounded-xl text-error font-body-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-error text-[20px]">error</span>
          <span>Lỗi truy vấn chuỗi khối: ${App.esc(elig.error)}</span>
        </div>
      `;
    } else if (elig.voted) {
      const labels = myChoices ? myChoices.choice_labels.map((l) => `<b>${App.esc(l)}</b>`).join(', ') : '';
      msg = `
        <div class="bg-on-tertiary-container/30 border-l-4 border-tertiary p-3 rounded-xl text-tertiary font-body-sm flex flex-col gap-1.5">
          <div class="flex items-center gap-1.5 font-bold">
            <span class="material-symbols-outlined text-tertiary text-[18px]">verified</span>
            <span>Bạn đã bỏ phiếu thành công trên Sepolia!</span>
          </div>
          ${labels ? `<div class="text-on-surface font-medium">Đã chọn: ${labels}</div>` : ''}
          ${myChoices ? `<a href="/verify/?tx=${App.esc(myChoices.tx_hash)}" class="font-bold text-primary hover:underline flex items-center gap-1 mt-0.5"><span class="material-symbols-outlined text-[16px]">receipt_long</span> Xem biên lai & xác minh phiếu ngay</a>` : ''}
        </div>
      `;
    } else if (E.is_private && !elig.whitelisted) {
      msg = `
        <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-xl text-amber-900 font-body-sm flex items-center gap-2">
          <span class="material-symbols-outlined text-amber-600 text-[20px]">lock</span>
          <span>Địa chỉ ví của bạn không có trong danh sách cử tri (Whitelist) của cuộc bầu cử này.</span>
        </div>
      `;
    } else {
      canPick = true;
    }

    box.innerHTML = msg;
    const conn = $('btnConn2');
    if (conn) conn.addEventListener('click', () => App.connect().then(refreshAll).catch((e) => { if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error'); }));

    if (!canPick) selected.clear();

    // Tìm ứng viên đang có nhiều phiếu nhất để gắn cờ "Đang dẫn đầu"
    const maxVotes = Math.max(0, ...E.options.map((o) => o.votes));

    // Render danh sách thẻ ứng viên Material 3 bằng Cards
    $('options').innerHTML = E.options.map((o) => {
      const isLeader = maxVotes > 0 && o.votes === maxVotes;
      const sel = selected.has(o.id);
      const full = canPick && !sel && selected.size >= E.max_choices && E.max_choices > 1;
      const noun = E.kind === 1 ? 'PHƯƠNG ÁN' : 'ỨNG VIÊN';
      const myVoted = elig.voted && myChoices && Array.isArray(myChoices.choices) && myChoices.choices.map(Number).includes(Number(o.id));

      return Cards.candidateCard ? Cards.candidateCard(o, {
        isLeader,
        sel,
        canPick,
        full,
        noun,
        kind: E.kind,
        myVoted: !!myVoted,
        hasVoted: !!elig.voted,
        isEnded: !open && live !== 'upcoming',
        contractAddress: E.address
      }) : '';
    }).join('');

    // Cập nhật Nhãn Ứng viên Đã Chọn trên Sticky Control Panel
    const selectedNames = [...selected].map((id) => {
      const opt = E.options.find((o) => o.id === id);
      return opt ? opt.label : '';
    }).filter(Boolean);

    const isProp = E.kind === 1;
    if ($('selected-candidate-title')) {
      $('selected-candidate-title').textContent = isProp ? 'Phương án đã chọn:' : 'Ứng viên đã chọn:';
    }

    if ($('selected-candidate-label')) {
      if (!selectedNames.length) {
        $('selected-candidate-label').textContent = isProp ? 'Chưa chọn phương án' : 'Chưa chọn ứng viên';
        $('selected-candidate-label').className = 'font-headline-sm text-headline-sm text-outline font-medium truncate max-w-[180px]';
      } else {
        $('selected-candidate-label').textContent = selectedNames.join(', ');
        $('selected-candidate-label').className = 'font-headline-sm text-headline-sm text-primary font-bold truncate max-w-[180px]';
      }
    }

    // Cập nhật Nút Submit Bỏ Phiếu
    const btnVote = $('btnVote');
    const btnVoteText = $('btnVoteText');
    const hasSelection = canPick && selected.size >= 1 && selected.size <= E.max_choices;

    btnVote.disabled = !hasSelection;
    if (btnVoteText) {
      if (elig.voted) {
        btnVoteText.textContent = 'Đã hoàn tất bỏ phiếu';
      } else if (!open) {
        btnVoteText.textContent = live === 'upcoming' ? 'Hòm phiếu chưa mở' : 'Hòm phiếu đã đóng';
      } else if (!me) {
        btnVoteText.textContent = 'Vui lòng kết nối ví';
      } else if (E.is_private && !elig.whitelisted) {
        btnVoteText.textContent = 'Không có quyền Whitelist';
      } else if (!selected.size) {
        btnVoteText.textContent = isProp ? 'Vui lòng chọn phương án' : 'Vui lòng chọn ứng viên';
      } else if (selected.size === 1) {
        btnVoteText.textContent = isProp ? `Biểu quyết: ${selectedNames[0]}` : `Bỏ phiếu cho ${selectedNames[0]}`;
      } else {
        btnVoteText.textContent = isProp ? `Biểu quyết cho ${selected.size} phương án` : `Bỏ phiếu cho ${selected.size} lựa chọn`;
      }
    }
  }

  // ---------------------------------------------------------------- 6. Render Tab Kết Quả Chi Tiết
  function renderResults() {
    const isEnded = (elig.connected && elig.chainStatus !== undefined) ? elig.chainStatus === 2 : liveStatus() === 'ended';
    // Sắp xếp các lựa chọn theo số phiếu giảm dần để hiển thị trực quan và đúng chuẩn
    const sortedOptions = [...(E.options || [])].sort((a, b) => b.votes - a.votes || a.id - b.id);
    const max = Math.max(0, ...sortedOptions.map((o) => o.votes));

    // 1. Banner vinh danh kết quả chung cuộc khi hòm phiếu đã kết thúc
    let winnerBanner = '';
    if (isEnded && max > 0) {
      const winners = sortedOptions.filter((o) => o.votes === max);
      if (winners.length === 1) {
        const w = winners[0];
        winnerBanner = `
          <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/80 flex items-center justify-between gap-4 shadow-xs">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center shadow-md shadow-amber-500/20 shrink-0">
                <span class="material-symbols-outlined text-[26px]">emoji_events</span>
              </div>
              <div>
                <div class="text-[11px] font-bold text-amber-800 uppercase tracking-wider font-label-tag flex items-center gap-1">
                  <span>KẾT QUẢ CHUNG CUỘC • HÒM PHIẾU ĐÃ ĐÓNG</span>
                </div>
                <h3 class="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  <span class="text-amber-700 font-extrabold">${App.esc(w.label)}</span> đã đắc cử với ${w.votes} phiếu (${w.percent}%)
                </h3>
              </div>
            </div>
            <div class="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-100/80 text-amber-900 font-label-tag text-xs font-bold border border-amber-200 shrink-0">
              <span class="material-symbols-outlined text-[15px] text-amber-600">verified</span>
              <span>Đã chốt kết quả</span>
            </div>
          </div>
        `;
      } else {
        const winnerNames = winners.map((w) => App.esc(w.label)).join(', ');
        winnerBanner = `
          <div class="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent border border-amber-300/80 flex items-center justify-between gap-4 shadow-xs">
            <div class="flex items-center gap-3.5">
              <div class="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-500 text-white flex items-center justify-center shadow-md shrink-0">
                <span class="material-symbols-outlined text-[26px]">emoji_events</span>
              </div>
              <div>
                <div class="text-[11px] font-bold text-amber-800 uppercase tracking-wider font-label-tag">
                  KẾT QUẢ CHUNG CUỘC • ĐỒNG HẠNG NHẤT
                </div>
                <h3 class="text-base sm:text-lg font-bold text-slate-900 mt-0.5">
                  Hòa phiếu: <span class="text-amber-700 font-extrabold">${winnerNames}</span> (${max} phiếu)
                </h3>
              </div>
            </div>
          </div>
        `;
      }
    }

    // 2. Danh sách từng ứng viên với xếp hạng, ảnh đại diện, thanh tiến trình
    const items = sortedOptions.map((o, idx) => {
      const isLeader = max > 0 && o.votes === max;
      const rank = idx + 1;
      const leaderLabel = isEnded ? 'Đắc cử' : 'Đang dẫn đầu';
      const initial = App.esc(o.label.charAt(0).toUpperCase());

      return `
        <div class="rounded-2xl p-4 sm:p-space-md border transition-all duration-200 flex flex-col gap-3 ${isLeader ? 'bg-gradient-to-r from-amber-50/70 via-white to-amber-50/30 border-amber-300/90 shadow-sm' : 'bg-surface-container-lowest border-slate-200/90 shadow-2xs hover:border-slate-300'}">
          <div class="flex items-center justify-between gap-3 flex-wrap">
            <div class="flex items-center gap-3 min-w-0">
              <!-- Số thứ tự xếp hạng / Huy hiệu cúp -->
              ${isLeader ? `
                <div class="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0" title="${leaderLabel}">
                  <span class="material-symbols-outlined text-[18px]">emoji_events</span>
                </div>
              ` : `
                <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-600 font-bold font-label-code text-xs flex items-center justify-center border border-slate-200 shrink-0">
                  #${rank}
                </div>
              `}

              <!-- Ảnh đại diện / Avatar ứng viên -->
              ${o.image_url ? `
                <img src="${App.esc(o.image_url)}" alt="${App.esc(o.label)}" class="w-9 h-9 rounded-xl object-cover border border-slate-200 shrink-0 bg-slate-100" onerror="this.style.display='none'" />
              ` : `
                <div class="w-9 h-9 rounded-xl bg-slate-100 text-primary font-bold text-sm flex items-center justify-center border border-slate-200 shrink-0">
                  ${initial}
                </div>
              `}

              <!-- Tên ứng viên & Badge -->
              <div class="flex items-center gap-2 min-w-0 flex-wrap">
                <span class="font-headline-sm text-sm sm:text-base font-bold text-slate-900 truncate">
                  ${App.esc(o.label)}
                </span>
                ${isLeader ? `
                  <span class="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-label-tag text-[11px] font-bold flex items-center gap-1 border border-amber-200 shrink-0">
                    <span class="material-symbols-outlined text-[13px] text-amber-600">stars</span>
                    <span>${leaderLabel}</span>
                  </span>
                ` : ''}
              </div>
            </div>

            <!-- Số lượng phiếu & Phần trăm -->
            <div class="flex items-baseline gap-1.5 shrink-0 ml-auto font-label-code">
              <span class="text-sm sm:text-base font-bold ${isLeader ? 'text-amber-700 font-black' : 'text-slate-900'}">${o.votes}</span>
              <span class="text-xs text-slate-500">phiếu</span>
              <span class="px-2 py-0.5 rounded-lg text-xs font-bold ${isLeader ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-slate-100 text-slate-700 border border-slate-200'}">
                ${o.percent}%
              </span>
            </div>
          </div>

          <!-- Thanh tiến trình kết quả -->
          <div class="w-full h-3 rounded-full bg-slate-100 overflow-hidden border border-slate-200/60 p-0.5">
            <div class="h-full rounded-full transition-all duration-700 ${isLeader ? 'bg-gradient-to-r from-amber-500 to-amber-400' : 'bg-primary'}" style="width: ${Math.min(100, Math.max(o.percent > 0 ? 3 : 0, o.percent))}%"></div>
          </div>
        </div>
      `;
    }).join('');

    let summaryHtml = '';
    if (E.is_private) {
      const turnout = (E.whitelist_count && E.whitelist_count > 0)
        ? Math.round((E.total_voters / E.whitelist_count) * 100)
        : 0;
      summaryHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
              <span class="material-symbols-outlined text-[22px]">how_to_reg</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Cử tri đã bỏ phiếu</span>
              <span class="font-headline-md text-xl sm:text-2xl text-primary font-bold">${E.total_voters}</span>
            </div>
          </div>
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary shrink-0">
              <span class="material-symbols-outlined text-[22px]">playlist_add_check</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Ví trong Whitelist</span>
              <span class="font-headline-md text-xl sm:text-2xl text-on-surface font-bold">${E.whitelist_count || 0}</span>
            </div>
          </div>
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-tertiary shrink-0">
              <span class="material-symbols-outlined text-[22px]">pie_chart</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Tỷ lệ tham gia</span>
              <span class="font-headline-md text-xl sm:text-2xl text-tertiary font-bold">${turnout}%</span>
            </div>
          </div>
        </div>
      `;
    } else {
      summaryHtml = `
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-primary shrink-0">
              <span class="material-symbols-outlined text-[22px]">how_to_reg</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Cử tri đã bỏ phiếu</span>
              <span class="font-headline-md text-xl sm:text-2xl text-primary font-bold">${E.total_voters}</span>
            </div>
          </div>
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-secondary shrink-0">
              <span class="material-symbols-outlined text-[22px]">ballot</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Số lượng lựa chọn</span>
              <span class="font-headline-md text-xl sm:text-2xl text-secondary font-bold">${E.options ? E.options.length : 0}</span>
            </div>
          </div>
          <div class="bg-surface-container-low p-3 sm:p-3.5 rounded-xl border border-surface-container-high/70 flex items-center gap-3">
            <div class="w-10 h-10 rounded-lg bg-surface-container-highest flex items-center justify-center text-tertiary shrink-0">
              <span class="material-symbols-outlined text-[22px]">public</span>
            </div>
            <div class="min-w-0">
              <span class="text-xs text-on-surface-variant font-medium block">Quyền tham gia</span>
              <span class="font-headline-md text-sm sm:text-base text-tertiary font-bold truncate block">Công khai mọi ví</span>
            </div>
          </div>
        </div>
      `;
    }

    $('pane-results').innerHTML = `
      ${summaryHtml}
      ${winnerBanner}
      <div class="flex flex-col gap-3 pt-2">
        ${items || '<div class="p-6 text-center text-on-surface-variant font-body-sm bg-surface-container-low rounded-xl">Chưa có ứng viên hoặc dữ liệu kết quả nào.</div>'}
      </div>
      ${E.max_choices > 1 ? '<p class="font-body-sm text-body-sm text-on-surface-variant text-center mt-2 flex items-center justify-center gap-1"><span class="material-symbols-outlined text-[16px] text-outline">info</span> Tổng tỷ lệ phần trăm có thể vượt 100% do cử tri được chọn nhiều lựa chọn.</p>' : ''}
    `;
  }

  // ---------------------------------------------------------------- 7. Tương tác Chọn Ứng Viên
  $('options').addEventListener('click', (ev) => {
    const card = ev.target.closest('.candidate-card');
    if (!card) return;
    const live = liveStatus();
    const open = elig.connected && elig.chainStatus !== undefined ? elig.chainStatus === 1 : live === 'open';
    if (!open || !App.state.address || elig.voted || (E.is_private && !elig.whitelisted)) return;

    const id = +card.dataset.candidateId;
    const max = E.max_choices;

    if (selected.has(id)) {
      selected.delete(id);
    } else if (max === 1) {
      selected.clear();
      selected.add(id);
    } else if (selected.size >= max) {
      App.toast(`Chỉ được chọn tối đa ${max} lựa chọn.`, 'warn');
      return;
    } else {
      selected.add(id);
    }

    renderVoteCard(liveStatus());
  });

  // ---------------------------------------------------------------- 8. Ước tính Phí Gas & Modal Xác Nhận Ký Web3 (Metamask)
  async function estimateOpGasFee(gasUnits = 85000n) {
    try {
      let p = App.state.provider;
      if (!p && App.cfg && App.cfg.rpc_url) {
        p = new ethers.JsonRpcProvider(App.cfg.rpc_url);
      }
      if (p) {
        const fee = await p.getFeeData();
        const gasPrice = fee.gasPrice || 1000000000n;
        const totalWei = gasPrice * BigInt(gasUnits);
        const eth = parseFloat(ethers.formatEther(totalWei));
        const ethFormatted = eth < 0.00001 ? '< 0.00001' : eth.toFixed(5);
        const gwei = Math.max(1, Math.round(Number(ethers.formatUnits(gasPrice, 'gwei'))));
        return {
          eth: `~${ethFormatted} ETH`,
          gwei: `${gwei} Gwei`
        };
      }
    } catch (_) {}
    return {
      eth: gasUnits <= 60000n ? '~0.00006 ETH' : '~0.00012 ETH',
      gwei: '~1 Gwei'
    };
  }

  const VoteModal = {
    open(optionsOrTitle, bodyHTML, onConfirm) {
      $('voteModal')?.remove();

      let opts = {};
      if (typeof optionsOrTitle === 'string') {
        opts = {
          title: optionsOrTitle,
          bodyHTML: bodyHTML,
          onConfirm: onConfirm
        };
      } else {
        opts = optionsOrTitle || {};
      }

      const title = opts.title || 'Xác nhận giao dịch';
      const badge = opts.badge || 'Giao dịch Web3';
      const icon = opts.icon || 'verified_user';
      const type = opts.type || 'info';
      const isDanger = type === 'danger';
      const confirmText = opts.confirmText || (isDanger ? 'Xác nhận thực hiện' : 'Ký giao dịch');
      const confirmIcon = opts.confirmIcon || (isDanger ? 'warning' : 'draw');
      const confirmClass = opts.confirmClass || (isDanger ? 'bg-error hover:bg-red-700 shadow-error/20' : 'bg-primary hover:bg-blue-700 shadow-primary/20');
      const htmlContent = opts.bodyHTML || '';

      document.body.insertAdjacentHTML('beforeend', `
        <div id="voteModal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div class="bg-surface-container-lowest rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl border border-surface-container-high/70 flex flex-col gap-4 relative">
            <!-- Nút đóng góc phải -->
            <button id="vmCloseBtn" type="button" class="absolute top-4 right-4 w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant hover:bg-slate-200 hover:text-on-surface flex items-center justify-center transition-all cursor-pointer">
              <span class="material-symbols-outlined text-[18px]">close</span>
            </button>

            <!-- Tiêu đề & Biểu tượng -->
            <div class="flex items-center gap-3 pr-8">
              <div class="w-11 h-11 rounded-2xl ${isDanger ? 'bg-red-100 text-error ring-4 ring-red-100/50' : 'bg-blue-100 text-primary ring-4 ring-blue-100/50'} flex items-center justify-center shrink-0">
                <span class="material-symbols-outlined text-[24px]">${icon}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-[11px] font-bold tracking-wider uppercase ${isDanger ? 'text-error' : 'text-primary'}">${badge}</span>
                <h3 id="vmTitle" class="font-headline-md text-lg sm:text-xl font-bold text-on-surface leading-tight">
                  ${App.esc(title)}
                </h3>
              </div>
            </div>

            <!-- Nội dung chính -->
            <div id="vmBody" class="font-body-md text-on-surface flex flex-col gap-3">
              ${htmlContent}
            </div>

            <!-- Nút hành động -->
            <div id="vmActions" class="flex items-center justify-end gap-3 pt-2 border-t border-surface-container/60">
              <button id="vmCancel" type="button" class="px-4 py-2.5 rounded-xl border border-surface-container-high/80 text-on-surface-variant font-headline-sm text-sm font-semibold hover:bg-surface-container-high transition-all cursor-pointer">
                Hủy
              </button>
              <button id="vmConfirm" type="button" class="px-5 py-2.5 rounded-xl ${confirmClass} text-white font-headline-sm text-sm font-bold flex items-center gap-1.5 shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer">
                <span class="material-symbols-outlined text-[18px]">${confirmIcon}</span>
                ${confirmText}
              </button>
            </div>
          </div>
        </div>
      `);

      const close = () => $('voteModal')?.remove();
      $('vmCloseBtn').onclick = close;
      $('vmCancel').onclick = close;
      $('vmConfirm').onclick = () => {
        $('vmActions').classList.add('hidden');
        $('vmCloseBtn').classList.add('hidden');
        if (opts.onConfirm) opts.onConfirm();
      };
    },

    progress(stepIndex, text, status = 'processing') {
      let stepsContainer = $('vmSteps');
      if (!stepsContainer) {
        $('vmBody').innerHTML = `
          <div class="bg-surface-container-low rounded-2xl p-4 border border-surface-container-high/60 flex flex-col gap-3" id="vmSteps"></div>
        `;
        stepsContainer = $('vmSteps');
      }

      const oldSpinner = stepsContainer.querySelector('.animate-spin');
      if (status === 'error' || status === 'cancelled') {
        $('vmTitle').textContent = status === 'error' ? 'Giao dịch thất bại' : 'Đã hủy bỏ';
        if (oldSpinner) {
          oldSpinner.outerHTML = `<span class="material-symbols-outlined text-${status === 'error' ? 'error' : 'outline'} text-[20px]">${status === 'error' ? 'cancel' : 'pause_circle'}</span>`;
        }
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-start gap-2.5 p-3 rounded-xl ${status === 'error' ? 'bg-red-50 text-error border border-red-200' : 'bg-surface-container-high text-on-surface-variant'} text-xs sm:text-sm font-semibold">
            <span class="material-symbols-outlined text-[20px] shrink-0 mt-0.5">${status === 'error' ? 'cancel' : 'info'}</span>
            <div class="flex-1 break-words">${App.esc(text)}</div>
          </div>
        `);
        $('vmActions').classList.remove('hidden');
        $('vmConfirm').classList.add('hidden');
        $('vmCloseBtn').classList.remove('hidden');
        $('vmCancel').textContent = 'Đóng lại';
        return;
      }

      if (oldSpinner) {
        const parentDiv = oldSpinner.closest('div');
        if (parentDiv) parentDiv.className = 'flex items-center gap-2 text-on-surface-variant text-xs sm:text-sm font-medium';
        oldSpinner.outerHTML = '<span class="material-symbols-outlined text-tertiary text-[20px]">check_circle</span>';
      }

      if (stepIndex === 2) {
        $('vmTitle').textContent = 'Hoàn tất giao dịch';
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 text-tertiary font-bold text-xs sm:text-sm p-3 rounded-xl bg-emerald-50 border border-emerald-200">
            <span class="material-symbols-outlined text-[20px] text-emerald-600">verified</span>
            <span>${App.esc(text)}</span>
          </div>
        `);
        setTimeout(() => $('voteModal')?.remove(), 2500);
      } else {
        $('vmTitle').textContent = 'Đang xử lý trên chuỗi...';
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 text-primary font-bold text-xs sm:text-sm p-2.5 rounded-xl bg-blue-50/60 border border-blue-100">
            <span class="material-symbols-outlined text-[20px] animate-spin text-primary">progress_activity</span>
            <span>${App.esc(text)}</span>
          </div>
        `);
      }
    }
  };

  const openConfirmModal = VoteModal.open;
  const setModalProgress = VoteModal.progress;

  // ---------------------------------------------------------------- 9. Xử lý Gửi Phiếu Bầu Thực Tế Lên Blockchain
  $('btnVote').addEventListener('click', async () => {
    const ids = [...selected].sort((a, b) => a - b);
    if (!ids.length || ids.length > E.max_choices) return;
    const selectedOptions = ids.map((i) => E.options.find((o) => o.id === i)).filter(Boolean);
    const names = selectedOptions.map((o) => o.label).join(', ');
    const noun = E.kind === 1 ? 'phương án' : 'ứng viên';

    // Ước tính phí gas thực tế từ mạng Sepolia
    const gasEst = await estimateOpGasFee(85000n);

    const bodyHTML = `
      <!-- Khối tóm tắt ứng viên được chọn -->
      <div class="bg-primary/5 rounded-2xl p-3.5 border border-primary/20 flex flex-col gap-1.5">
        <div class="flex items-center justify-between">
          <span class="text-[11px] font-bold text-primary uppercase tracking-wide flex items-center gap-1">
            <span class="material-symbols-outlined text-[15px]">how_to_vote</span>
            ${ids.length > 1 ? `Lựa chọn của bạn (${ids.length} ${noun})` : `Lựa chọn của bạn`}
          </span>
          <span class="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[11px] font-bold">
            #${ids.map((i) => String(i + 1).padStart(2, '0')).join(', #')}
          </span>
        </div>
        <div class="font-bold text-on-surface text-base sm:text-lg flex items-center gap-2">
          <span class="material-symbols-outlined text-primary text-[20px] shrink-0">check_circle</span>
          <span class="break-words font-headline-md">${App.esc(names)}</span>
        </div>
      </div>

      <!-- Bảng thông số giao dịch & Phí gas cần trả -->
      <div class="bg-surface-container-low rounded-2xl p-3 border border-surface-container-high/60 flex flex-col gap-2 text-xs">
        <div class="flex items-center justify-between text-on-surface-variant pb-1.5 border-b border-surface-container/60">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Mạng chuỗi khối:
          </span>
          <span class="font-semibold text-on-surface">Ethereum Sepolia</span>
        </div>
        <div class="flex items-center justify-between text-on-surface-variant pb-1.5 border-b border-surface-container/60">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="material-symbols-outlined text-[15px] text-primary">local_gas_station</span>
            Phí gas cần trả:
          </span>
          <div class="flex items-center gap-1 font-bold text-emerald-700">
            <span>${gasEst.eth}</span>
            <span class="text-[10px] text-outline font-normal">(${gasEst.gwei} • Testnet)</span>
          </div>
        </div>
        <div class="flex items-center justify-between text-on-surface-variant">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="material-symbols-outlined text-[15px] text-outline">description</span>
            Loại giao dịch:
          </span>
          <span class="font-mono text-[11px] text-on-surface bg-surface-container px-2 py-0.5 rounded font-medium">vote(uint256[])</span>
        </div>
      </div>

      <!-- Cảnh báo bất biến Web3 -->
      <div class="bg-amber-50/90 border border-amber-200/80 rounded-xl p-3 text-xs text-amber-900 leading-relaxed flex items-start gap-2">
        <span class="material-symbols-outlined text-amber-600 text-[18px] shrink-0 mt-0.5">info</span>
        <div>
          Lá phiếu sẽ được ghi nhận <b>vĩnh viễn</b> trên chuỗi khối. Bạn <b>không thể sửa đổi hoặc thu hồi</b> sau khi ký xác nhận ví.
        </div>
      </div>
    `;

    openConfirmModal({
      title: 'Xác nhận gửi phiếu',
      badge: 'Bỏ phiếu Web3',
      icon: 'how_to_vote',
      type: 'vote',
      confirmText: 'Ký giao dịch',
      confirmIcon: 'draw',
      confirmClass: 'bg-primary hover:bg-blue-700 shadow-primary/20',
      bodyHTML,
      onConfirm: async () => {
        $('btnVote').disabled = true;
        let rc = null;
        try {
          setModalProgress(0, 'Vui lòng xác nhận giao dịch trong ví MetaMask...');
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          const tx = await c.vote(ids);

          setModalProgress(1, 'Đang đợi Sepolia xác nhận khối (khoảng 12s)...');
          rc = await tx.wait();

          setModalProgress(2, 'Ghi nhận phiếu bầu thành công trên Blockchain!');

          selected.clear();
          ids.forEach((id) => {
            const opt = E.options.find((o) => o.id === id);
            if (opt) opt.votes += 1;
          });
          E.total_voters += 1;
          E.options.forEach((o) => o.percent = Math.round((o.votes / E.total_voters) * 100) || 0);

          elig.voted = true;
          myChoices = {
            choices: ids,
            choice_labels: ids.map((i) => {
              const opt = E.options.find((o) => o.id === i);
              return opt ? opt.label : `#${i}`;
            }),
            tx_hash: rc.hash,
            voter: App.state.address,
            time: new Date().toISOString()
          };
          try {
            localStorage.setItem(`vote_${ADDR.toLowerCase()}_${App.state.address.toLowerCase()}`, JSON.stringify(myChoices));
          } catch (_) {}

          renderResults();
          renderVoteCard(liveStatus());
          await refreshEligibility();
          setTimeout(refreshAll, 2500);
          setTimeout(refreshAll, 7000);
        } catch (e) {
          if (e.code === 'ACTION_REJECTED' || e.code === 4001) {
            setModalProgress(-1, 'Đã từ chối xác nhận trên ví MetaMask', 'cancelled');
          } else {
            setModalProgress(-1, App.errMsg(e), 'error');
          }
        }
        renderVoteCard(liveStatus());
      }
    });
  });

  // ---------------------------------------------------------------- 10. Quản Trị Của Chủ Sở Hữu (Owner Panel)
  function renderOwner(live, isOwner) {
    $('ownerPanel').classList.toggle('hidden', !isOwner);
    if (!isOwner) return;
    const notFinished = live === 'open' || live === 'upcoming';
    $('ownerWhitelist').classList.toggle('hidden', !(E.is_private && notFinished));
    $('ownerSchedule').classList.toggle('hidden', live !== 'upcoming');
    $('ownerClose').classList.toggle('hidden', !notFinished);
    if (!notFinished) $('ownerPanel').classList.add('hidden');
  }

  const parseAddresses = App.parseAddresses;

  $('wlInput').addEventListener('input', () => {
    const { valid, invalid } = parseAddresses($('wlInput').value);
    $('wlHint').innerHTML = valid.length || invalid.length
      ? `<span class="text-tertiary font-bold"><span class="material-symbols-outlined text-[14px]">check</span> ${valid.length} hợp lệ</span>${invalid.length ? ` <span class="text-error font-bold ml-2"><span class="material-symbols-outlined text-[14px]">close</span> ${invalid.length} lỗi</span>` : ''}`
      : '';
  });

  $('btnWl').addEventListener('click', async () => {
    const { valid, invalid } = parseAddresses($('wlInput').value);
    if (invalid.length && !confirm(`Có ${invalid.length} dòng không hợp lệ sẽ bị bỏ qua.\nTiếp tục với ${valid.length} địa chỉ hợp lệ?`)) return;
    if (!valid.length) return App.toast('Chưa có địa chỉ hợp lệ nào.', 'error');
    $('btnWl').disabled = true;
    try {
      await App.ensureChain();
      const c = App.electionContract(ADDR, App.state.signer);
      const n = Math.ceil(valid.length / WL_CHUNK);
      for (let i = 0; i < n; i++) {
        const chunk = valid.slice(i * WL_CHUNK, (i + 1) * WL_CHUNK);
        await App.tx(`Thêm cử tri (${i + 1}/${n})`, () => c.addToWhitelist(chunk));
      }
      $('wlInput').value = ''; $('wlHint').textContent = '';
      setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
    } catch (err) {
      App.toast(`Thêm cử tri thất bại: ${App.errMsg(err)}`, 'error');
    }
    $('btnWl').disabled = false;
  });

  $('btnResched').addEventListener('click', async () => {
    try {
      await App.ensureChain();
      const c = App.electionContract(ADDR, App.state.signer);
      await App.tx('Dời lịch hòm phiếu', () => c.reschedule(App.toUnix($('rsStart').value), App.toUnix($('rsEnd').value)));
      setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
    } catch (err) {
      App.toast(`Dời lịch thất bại: ${App.errMsg(err)}`, 'error');
    }
  });

  $('btnClose').addEventListener('click', async () => {
    const gasEst = await estimateOpGasFee(60000n);

    const bodyHTML = `
      <!-- Cảnh báo đỏ nổi bật -->
      <div class="bg-red-50 border border-red-200/80 rounded-2xl p-3.5 text-xs text-red-900 leading-relaxed flex flex-col gap-2">
        <div class="flex items-center gap-1.5 text-error font-bold text-xs sm:text-sm">
          <span class="material-symbols-outlined text-[18px]">warning</span>
          <span>CẢNH BÁO TỐI QUAN TRỌNG</span>
        </div>
        <div>
          Bạn có chắc chắn muốn đóng hòm phiếu <b>NGAY BÂY GIỜ</b>?
        </div>
        <div class="text-[11px] text-red-800 bg-red-100/60 p-2 rounded-xl border border-red-200 leading-normal">
          Sau khi xác nhận trên blockchain, không ai có thể bỏ phiếu tiếp và hành động này <b>KHÔNG THỂ hoàn tác</b>!
        </div>
      </div>

      <!-- Bảng thông số giao dịch & Phí gas cần trả -->
      <div class="bg-surface-container-low rounded-2xl p-3 border border-surface-container-high/60 flex flex-col gap-2 text-xs">
        <div class="flex items-center justify-between text-on-surface-variant pb-1.5 border-b border-surface-container/60">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Mạng chuỗi khối:
          </span>
          <span class="font-semibold text-on-surface">Ethereum Sepolia</span>
        </div>
        <div class="flex items-center justify-between text-on-surface-variant pb-1.5 border-b border-surface-container/60">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="material-symbols-outlined text-[15px] text-error">local_gas_station</span>
            Phí gas cần trả:
          </span>
          <div class="flex items-center gap-1 font-bold text-slate-800">
            <span>${gasEst.eth}</span>
            <span class="text-[10px] text-outline font-normal">(${gasEst.gwei} • Testnet)</span>
          </div>
        </div>
        <div class="flex items-center justify-between text-on-surface-variant">
          <span class="flex items-center gap-1.5 text-on-surface-variant font-medium">
            <span class="material-symbols-outlined text-[15px] text-outline">admin_panel_settings</span>
            Quyền thực thi:
          </span>
          <span class="font-medium text-primary text-xs">Chủ sở hữu (Owner)</span>
        </div>
      </div>
    `;

    openConfirmModal({
      title: 'Đóng hòm phiếu khẩn cấp',
      badge: 'Quản trị viên',
      icon: 'lock',
      type: 'danger',
      confirmText: 'Xác nhận đóng ngay',
      confirmIcon: 'lock',
      confirmClass: 'bg-error hover:bg-red-700 shadow-error/20',
      bodyHTML,
      onConfirm: async () => {
        try {
          setModalProgress(0, 'Đang chờ bạn ký xác nhận trong ví MetaMask...');
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          const tx = await c.closeEarly();
          setModalProgress(1, 'Đang đợi Sepolia xác nhận giao dịch...');
          await tx.wait();
          setModalProgress(2, 'Đã đóng hòm phiếu vĩnh viễn trên chuỗi!');
          setTimeout(refreshAll, 2500);
          setTimeout(refreshAll, 7000);
        } catch (e) {
          if (e.code === 'ACTION_REJECTED' || e.code === 4001) {
            setModalProgress(-1, 'Đã hủy bỏ thao tác đóng hòm phiếu', 'cancelled');
          } else {
            setModalProgress(-1, App.errMsg(e), 'error');
          }
        }
      }
    });
  });

  // ---------------------------------------------------------------- 11. Tab Phiếu Đã Bỏ & Whitelist
  async function loadVoters() {
    const el = $('pane-voters');
    try {
      const d = await App.api(`/api/elections/${ADDR}/voters/?page=${pages.voters}&page_size=15`);
      el.innerHTML = (Cards.votersTable ? Cards.votersTable(d.votes) : '') + (d.votes && d.votes.length ? '<div class="pager mt-4 flex justify-center" id="vPager"></div>' : '');
      const pg = $('vPager');
      if (pg && Cards.pager) Cards.pager(pg, d.page, d.pages, (n) => { pages.voters = n; loadVoters(); });
    } catch (e) {
      el.innerHTML = `<div class="bg-red-50 text-error p-3 rounded-xl font-body-sm">${App.esc(e.message)}</div>`;
    }
  }

  async function loadWhitelist() {
    const el = $('pane-whitelist');
    try {
      const d = await App.api(`/api/elections/${ADDR}/whitelist/?page=${pages.whitelist}&page_size=50`);
      const canRemove = App.sameAddr(App.state.address, E.owner) && ['open', 'upcoming'].includes(liveStatus());
      el.innerHTML = (Cards.whitelistTable ? Cards.whitelistTable(d.entries, d.total, canRemove) : '') + (d.entries && d.entries.length ? '<div class="pager mt-4 flex justify-center" id="wPager"></div>' : '');
      const pg = $('wPager');
      if (pg && Cards.pager) Cards.pager(pg, d.page, d.pages, (n) => { pages.whitelist = n; loadWhitelist(); });

      el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          await App.tx('Gỡ cử tri', () => c.removeFromWhitelist([b.dataset.rm]));
          setTimeout(refreshAll, 2500);
        } catch (err) {
          App.toast(`Gỡ cử tri thất bại: ${App.errMsg(err)}`, 'error');
        }
      }));
    } catch (e) {
      el.innerHTML = `<div class="bg-red-50 text-error p-3 rounded-xl font-body-sm">${App.esc(e.message)}</div>`;
    }
  }

  // Chuyển Tab
  document.querySelectorAll('.tab-btn').forEach((t) => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((x) => {
      const active = x === t;
      x.className = active
        ? 'tab-btn active px-space-md py-space-sm rounded-xl font-headline-sm text-headline-sm font-bold flex items-center gap-1.5 bg-primary-container text-on-primary shadow-sm transition-all'
        : 'tab-btn px-space-md py-space-sm rounded-xl font-headline-sm text-headline-sm font-semibold flex items-center gap-1.5 text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all';
    });
    ['results', 'voters', 'whitelist'].forEach((n) => $('pane-' + n).classList.toggle('hidden', n !== activeTab));
    if (activeTab === 'voters') loadVoters();
    if (activeTab === 'whitelist') loadWhitelist();
  }));

  // ---------------------------------------------------------------- 12. Lắng nghe Sự kiện On-Chain qua WebSocket & Provider
  async function setupOnChainListener() {
    if (!App.hasWallet()) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const c = App.electionContract(ADDR, provider);
      c.on("VoteCast", (voter, choices) => {
        if (!App.sameAddr(voter, App.state.address)) {
          App.toast("Vừa có cử tri mới bỏ phiếu trên chuỗi khối Sepolia!", "info");
          setTimeout(refreshAll, 1000);
        }
      });
    } catch (_) { }
  }

  // ---------------------------------------------------------------- 13. Khởi Động Trang
  for (let tries = 0; ; tries++) {
    try {
      await loadElection();
      break;
    } catch (e) {
      if (e.status === 404 && isNew && tries < 40) {
        $('loading').classList.add('hidden');
        $('syncing').classList.remove('hidden');
        await sleep(3000);
        continue;
      }
      $('loading').classList.add('hidden');
      $('syncing').classList.add('hidden');
      $('fatal').classList.remove('hidden');
      $('fatal').innerHTML = e.status === 404
        ? '<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[24px]">search_off</span><span>Không tìm thấy hòm phiếu này trên hệ thống. Nếu bạn vừa tạo, vui lòng đợi vài giây để hệ thống đồng bộ từ Sepolia rồi tải lại trang.</span></div>'
        : e.message;
      return;
    }
  }

  $('loading').classList.add('hidden');
  $('syncing').classList.add('hidden');
  $('content').classList.remove('hidden');

  await refreshEligibility();
  render();
  setupOnChainListener();
  setInterval(updateCountdown, 1000);
  setInterval(refreshAll, 60000);
  App.watch(ADDR.toLowerCase(), App.debounce(refreshAll, 600));
})();
