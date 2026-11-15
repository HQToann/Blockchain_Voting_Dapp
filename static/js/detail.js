/**
 * Logic điều khiển giao diện Chi Tiết Hòm Phiếu Bầu Cử (Detail Page)
 * Tích hợp ABI Smart Contract (Election.sol), API Backend Django, IPFS & Web3 Ethers.js
 */
(async () => {
  await App.init();
  const $ = App.$;
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
        const v = await App.api(`/api/elections/${ADDR}/voters/?voter=${me}`);
        myChoices = v.votes.length ? v.votes[0] : null;
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

    // Render Badges bằng ElectionCards
    $('badges').innerHTML = ElectionCards.detailBadges(E, live, isOwner);

    // Meta line (Chủ sở hữu, Hòm phiếu contract, Thời gian tạo)
    const explorerUrl = App.cfg.explorer_url || 'https://sepolia.etherscan.io';
    $('metaLine').innerHTML = `
      <span class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px] text-primary">account_circle</span>
        <span>Chủ: <a href="${explorerUrl}/address/${E.owner}" target="_blank" rel="noopener" class="font-label-code text-primary font-semibold hover:underline">${App.short(E.owner)}</a></span>
      </span>
      <span class="text-outline">•</span>
      <span class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px] text-primary">token</span>
        <span>Contract: <a href="${explorerUrl}/address/${E.address}" target="_blank" rel="noopener" class="font-label-code text-primary font-semibold hover:underline">${App.short(E.address)}</a></span>
      </span>
      <span class="text-outline">•</span>
      <span class="flex items-center gap-1">
        <span class="material-symbols-outlined text-[16px] text-outline">calendar_today</span>
        <span>${App.fmtDate(E.created_at)}</span>
      </span>
    `;

    $('title').textContent = E.name;
    $('desc').textContent = E.description || 'Cuộc bầu cử phi tập trung được bảo đảm toàn vẹn và bất biến trên sổ cái chuỗi khối Ethereum Sepolia.';

    // Thống kê nhanh
    $('statTotalVoters').textContent = E.is_private
      ? `${E.whitelist_count || 0} ví Whitelist`
      : 'Cộng đồng mở';
    $('statVotedCount').textContent = `${E.total_voters} phiếu`;

    // Quy chế bỏ phiếu (Rule Box)
    const k = E.max_choices;
    let ruleHtml = `
      <div class="flex items-center gap-2 font-semibold text-primary mb-1">
        <span class="material-symbols-outlined text-[18px]">verified</span>
        <span>Quy chế kiểm phiếu:</span>
      </div>
      <div>
        ${k === 1
          ? 'Mỗi cử tri chỉ được chọn <b>đúng 1</b> lựa chọn duy nhất.'
          : `Mỗi cử tri được phép chọn <b>từ 1 đến ${k}</b> lựa chọn khác nhau.`
        }
        ${E.is_private
          ? '<br><span class="text-amber-800 font-medium flex items-center gap-1 mt-1"><span class="material-symbols-outlined text-[16px] text-amber-600">lock</span> Hòm phiếu riêng tư: Chỉ các địa chỉ ví nằm trong danh sách Whitelist được cấp quyền mới có thể bỏ phiếu.</span>'
          : ''
        }
      </div>
    `;
    $('ruleBox').innerHTML = ruleHtml;

    // Tiêu đề khu vực ứng viên
    const optNoun = E.kind === 1 ? 'phương án' : 'ứng viên';
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

    // Render danh sách thẻ ứng viên Material 3 bằng ElectionCards
    $('options').innerHTML = E.options.map((o) => {
      const isLeader = maxVotes > 0 && o.votes === maxVotes;
      const sel = selected.has(o.id);
      const full = canPick && !sel && selected.size >= E.max_choices && E.max_choices > 1;
      const noun = E.kind === 1 ? 'PHƯƠNG ÁN' : 'ỨNG VIÊN';
      const myVoted = elig.voted && myChoices && myChoices.choices.includes(o.id);

      return ElectionCards.candidateCard(o, {
        isLeader,
        sel,
        canPick,
        full,
        noun,
        kind: E.kind,
        myVoted,
        contractAddress: E.address
      });
    }).join('');

    // Cập nhật Nhãn Ứng viên Đã Chọn trên Sticky Control Panel
    const selectedNames = [...selected].map((id) => {
      const opt = E.options.find((o) => o.id === id);
      return opt ? opt.label : '';
    }).filter(Boolean);

    if ($('selected-candidate-label')) {
      if (!selectedNames.length) {
        $('selected-candidate-label').textContent = 'Chưa chọn ứng viên';
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
        btnVoteText.textContent = 'Vui lòng chọn ứng viên';
      } else if (selected.size === 1) {
        btnVoteText.textContent = `Bỏ phiếu cho ${selectedNames[0]}`;
      } else {
        btnVoteText.textContent = `Bỏ phiếu cho ${selected.size} lựa chọn`;
      }
    }
  }

  // ---------------------------------------------------------------- 6. Render Tab Kết Quả Chi Tiết
  function renderResults() {
    const max = Math.max(0, ...E.options.map((o) => o.votes));
    const items = E.options.map((o) => {
      const isLeader = max > 0 && o.votes === max;
      return `
        <div class="bg-surface-container-low rounded-xl p-space-md border ${isLeader ? 'border-primary-container/60 bg-primary-container/[0.02]' : 'border-surface-container-high/60'} flex flex-col gap-2">
          <div class="flex justify-between items-center font-headline-sm text-body-md">
            <span class="text-on-surface font-semibold flex items-center gap-1.5">
              ${isLeader ? '<span class="material-symbols-outlined text-amber-500 text-[18px]">trophy</span>' : ''}
              ${App.esc(o.label)}
            </span>
            <span class="${isLeader ? 'text-primary font-bold' : 'text-on-surface-variant'} font-label-code text-label-code">
              ${o.votes} phiếu (${o.percent}%)
            </span>
          </div>
          <div class="w-full h-2.5 rounded-full bg-surface-container-high overflow-hidden">
            <div class="h-full ${isLeader ? 'bg-primary-container' : 'bg-surface-container-highest'} rounded-full transition-all duration-500" style="width: ${Math.min(100, o.percent)}%"></div>
          </div>
        </div>
      `;
    }).join('');

    const wl = E.is_private ? `
      <div class="text-center">
        <span class="font-headline-xl text-headline-xl text-on-surface font-bold block">${E.whitelist_count || 0}</span>
        <span class="font-body-sm text-body-sm text-on-surface-variant">Ví được cấp quyền</span>
      </div>
    ` : '';

    $('pane-results').innerHTML = `
      <div class="grid grid-cols-2 gap-space-md bg-surface-container-low p-space-md rounded-xl border border-surface-container-high/60">
        <div class="text-center">
          <span class="font-headline-xl text-headline-xl text-primary font-bold block">${E.total_voters}</span>
          <span class="font-body-sm text-body-sm text-on-surface-variant">Tổng cử tri đã bỏ phiếu</span>
        </div>
        ${wl}
      </div>
      <div class="flex flex-col gap-space-sm pt-2">
        ${items}
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

  // ---------------------------------------------------------------- 8. Modal Xác Nhận Ký Giao Dịch Web3 (Metamask)
  const VoteModal = {
    open(title, bodyHTML, onConfirm) {
      $('voteModal')?.remove();
      document.body.insertAdjacentHTML('beforeend', `
        <div id="voteModal" class="fixed inset-0 bg-on-surface/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div class="bg-surface-container-lowest rounded-2xl p-space-lg w-full max-w-md shadow-2xl border border-surface-container-high flex flex-col gap-space-md">
            <h3 id="vmTitle" class="font-headline-md text-headline-md text-on-surface font-bold text-center flex items-center justify-center gap-2">
              <span class="material-symbols-outlined text-primary text-[24px]">verified_user</span> ${title}
            </h3>
            <div id="vmBody" class="font-body-md text-on-surface">${bodyHTML}</div>
            <div id="vmActions" class="flex justify-end gap-space-sm pt-2">
              <button id="vmCancel" type="button" class="px-space-md py-2 rounded-xl bg-surface-container-high text-on-surface font-headline-sm text-body-md font-semibold hover:bg-surface-container-highest transition-all cursor-pointer">
                Hủy
              </button>
              <button id="vmConfirm" type="button" class="px-space-md py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm text-body-md font-bold hover:bg-primary transition-all flex items-center gap-1.5 shadow-sm cursor-pointer">
                <span class="material-symbols-outlined text-[18px]">draw</span>
                Ký giao dịch
              </button>
            </div>
          </div>
        </div>
      `);
      $('vmCancel').onclick = () => $('voteModal')?.remove();
      $('vmConfirm').onclick = () => {
        $('vmActions').classList.add('hidden');
        onConfirm();
      };
    },

    progress(stepIndex, text, status = 'processing') {
      let stepsContainer = $('vmSteps');
      if (!stepsContainer) {
        $('vmBody').innerHTML = `<div id="vmSteps" class="flex flex-col gap-3 py-2"></div>`;
        stepsContainer = $('vmSteps');
      }

      const oldSpinner = stepsContainer.querySelector('.animate-spin');
      if (status === 'error' || status === 'cancelled') {
        $('vmTitle').textContent = status === 'error' ? 'Giao dịch thất bại' : 'Đã hủy bỏ';
        if (oldSpinner) {
          oldSpinner.outerHTML = `<span class="material-symbols-outlined text-${status === 'error' ? 'error' : 'outline'} text-[20px]">${status === 'error' ? 'cancel' : 'pause_circle'}</span>`;
        }
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 font-semibold ${status === 'error' ? 'text-error' : 'text-on-surface-variant'}">
            <span class="material-symbols-outlined text-[20px]">${status === 'error' ? 'cancel' : 'pause_circle'}</span>
            <span>${App.esc(text)}</span>
          </div>
        `);
        $('vmActions').classList.remove('hidden');
        $('vmConfirm').classList.add('hidden');
        $('vmCancel').textContent = 'Đóng';
        return;
      }

      if (oldSpinner) {
        const parentDiv = oldSpinner.closest('div');
        if (parentDiv) parentDiv.className = 'flex items-center gap-2 text-on-surface-variant font-medium';
        oldSpinner.outerHTML = '<span class="material-symbols-outlined text-tertiary text-[20px]">check_circle</span>';
      }

      if (stepIndex === 2) {
        $('vmTitle').textContent = 'Hoàn tất giao dịch';
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 text-tertiary font-bold">
            <span class="material-symbols-outlined text-[20px]">check_circle</span>
            <span>${App.esc(text)}</span>
          </div>
        `);
        setTimeout(() => $('voteModal')?.remove(), 3000);
      } else {
        $('vmTitle').textContent = 'Đang xử lý trên chuỗi...';
        stepsContainer.insertAdjacentHTML('beforeend', `
          <div class="flex items-center gap-2 text-primary font-bold">
            <span class="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
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
    const names = ids.map((i) => E.options.find((o) => o.id === i).label).join(', ');

    openConfirmModal(
      'Xác nhận gửi phiếu',
      `
        <div class="bg-surface-container-low p-space-md rounded-xl border border-surface-container-high/60 mb-space-md">
          <span class="font-body-sm text-body-sm text-on-surface-variant block mb-1">Bạn đang bỏ phiếu cho:</span>
          <b class="font-headline-sm text-headline-sm text-primary block">${App.esc(names)}</b>
        </div>
        <div class="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-xl text-amber-900 font-body-sm">
          <span class="font-bold flex items-center gap-1 mb-1">
            <span class="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
            Lưu ý bất biến Web3:
          </span>
          Phiếu bầu sẽ được ký và ghi vĩnh viễn lên chuỗi khối Ethereum Sepolia. Bạn <b>KHÔNG THỂ</b> sửa đổi hoặc thu hồi sau khi gửi.
        </div>
      `,
      async () => {
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
    );
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
    openConfirmModal(
      'Đóng hòm phiếu khẩn cấp',
      `
        <div class="bg-red-50 border-l-4 border-error p-3 rounded-xl text-error font-body-md mb-2">
          <b class="flex items-center gap-1 mb-1">
            <span class="material-symbols-outlined text-[18px]">warning</span>
            CẢNH BÁO TỐI QUAN TRỌNG:
          </b>
          Bạn có chắc chắn muốn đóng hòm phiếu <b>NGAY BÂY GIỜ</b>?<br>
          Sau khi giao dịch xác nhận trên blockchain, không ai có thể bỏ phiếu tiếp và hành động này <b>KHÔNG THỂ</b> hoàn tác!
        </div>
      `,
      async () => {
        try {
          setModalProgress(0, 'Đang chờ bạn ký xác nhận trong ví MetaMask...');
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          const tx = await c.closeEarly();
          setModalProgress(1, 'Đang đợi Sepolia xác nhận giao dịch...');
          await tx.wait();
          setModalProgress(2, 'Đã đóng hòm phiếu vĩnh viễn trên chuỗi!');
          setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
        } catch (e) {
          if (e.code === 'ACTION_REJECTED' || e.code === 4001) setModalProgress(-1, 'Đã hủy', 'cancelled');
          else setModalProgress(-1, App.errMsg(e), 'error');
        }
      }
    );
  });

  // ---------------------------------------------------------------- 11. Tab Phiếu Đã Bỏ & Whitelist
  async function loadVoters() {
    const el = $('pane-voters');
    try {
      const d = await App.api(`/api/elections/${ADDR}/voters/?page=${pages.voters}&page_size=15`);
      el.innerHTML = ElectionCards.votersTable(d.votes) + (d.votes && d.votes.length ? '<div class="pager mt-4 flex justify-center" id="vPager"></div>' : '');
      const pg = $('vPager');
      if (pg) ElectionCards.pager(pg, d.page, d.pages, (n) => { pages.voters = n; loadVoters(); });
    } catch (e) {
      el.innerHTML = `<div class="bg-red-50 text-error p-3 rounded-xl font-body-sm">${App.esc(e.message)}</div>`;
    }
  }

  async function loadWhitelist() {
    const el = $('pane-whitelist');
    try {
      const d = await App.api(`/api/elections/${ADDR}/whitelist/?page=${pages.whitelist}&page_size=50`);
      const canRemove = App.sameAddr(App.state.address, E.owner) && ['open', 'upcoming'].includes(liveStatus());
      el.innerHTML = ElectionCards.whitelistTable(d.entries, d.total, canRemove) + (d.entries && d.entries.length ? '<div class="pager mt-4 flex justify-center" id="wPager"></div>' : '');
      const pg = $('wPager');
      if (pg) ElectionCards.pager(pg, d.page, d.pages, (n) => { pages.whitelist = n; loadWhitelist(); });

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
