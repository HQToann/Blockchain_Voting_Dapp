(async () => {
  await App.init();
  const $ = (id) => document.getElementById(id);
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

  // ---------------------------------------------------------------- tải dữ liệu
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
        c.hasVoted(me), E.is_private ? c.whitelist(me) : Promise.resolve(true), c.status()]);
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

  // ---------------------------------------------------------------- hiển thị
  function render() {
    const live = liveStatus();
    lastLive = live;
    document.title = `${E.name} — Hòm Phiếu Cộng Đồng`;
    const isOwner = App.sameAddr(App.state.address, E.owner);
    $('syncWarning').classList.toggle('hidden', !E.indexer.lagging);

    $('badges').innerHTML = [App.statusBadge(live), App.kindBadge(E.kind),
      E.is_private ? '<span class="badge private" style="background: #faf5ff; color: #7e22ce; border: 1px solid #e9d5ff;"><i class="fa-solid fa-lock"></i> Riêng tư</span>' : '<span class="badge kind" style="background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0;"><i class="fa-solid fa-globe"></i> Công khai</span>',
      isOwner ? '<span class="badge owner" style="background: #fef9c3; color: #854d0e; border: 1px solid #fde68a;"><i class="fa-solid fa-crown"></i> Của bạn</span>' : ''].join(' ');
    $('title').textContent = E.name;
    $('desc').textContent = E.description || '';
    $('desc').classList.toggle('hidden', !E.description);
    $('metaLine').innerHTML = `<span style="display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-user-shield" style="color:var(--accent);"></i> Chủ: ${App.addrLink(E.owner)}</span>
      <span style="display:flex; align-items:center; gap:4px;"><i class="fa-solid fa-box-archive" style="color:var(--accent);"></i> Hòm phiếu: ${App.addrLink(E.address)}</span>
      <span style="display:flex; align-items:center; gap:4px;"><i class="fa-regular fa-calendar-plus" style="color:var(--accent);"></i> Tạo: ${App.esc(App.fmtDate(E.created_at))}</span>`;

    const k = E.max_choices;
    $('ruleBox').innerHTML = (k === 1
      ? 'Mỗi cử tri chọn <b>đúng 1</b> lựa chọn.'
      : `Mỗi cử tri được chọn <b>từ 1 đến ${k}</b> lựa chọn.`)
      + (E.is_private ? ' <br><i class="fa-solid fa-lock" style="color:var(--warn); margin-right:4px;"></i> Chỉ các ví trong danh sách (Whitelist) mới được bỏ phiếu.' : '');

    renderVoteCard(live);
    renderResults();
    renderOwner(live, isOwner);
    $('tabWl').classList.toggle('hidden', !E.is_private);
    updateCountdown();
  }

  function updateCountdown() {
    const now = Date.now() + skew, live = liveStatus();
    let t = '';
    if (live === 'upcoming') t = `<i class="fa-solid fa-hourglass-start" style="margin-right:6px;"></i> Bắt đầu sau ${App.fmtDuration(Date.parse(E.start_time) - now)} (${App.fmtDate(E.start_time)})`;
    else if (live === 'open') t = E.end_time ? `<i class="fa-solid fa-stopwatch" style="margin-right:6px;"></i> Còn ${App.fmtDuration(Date.parse(E.end_time) - now)} (đến ${App.fmtDate(E.end_time)})` : '<i class="fa-solid fa-infinity" style="margin-right:6px;"></i> Không hẹn giờ kết thúc';
    else t = live === 'closed' ? '<i class="fa-solid fa-ban" style="margin-right:6px;"></i> Chủ hòm phiếu đã đóng sớm.' : `<i class="fa-solid fa-flag-checkered" style="margin-right:6px;"></i> Đã kết thúc lúc ${App.fmtDate(E.end_time)}`;
    
    // Đổi màu countdown tương ứng
    $('countdown').className = live === 'ended' || live === 'closed' ? 'muted' : '';
    $('countdown').innerHTML = t;
    if (lastLive !== null && live !== lastLive) refreshAll();
  }

  function renderVoteCard(live) {
    const box = $('voteStatus'), me = App.state.address;
    const open = elig.connected && elig.chainStatus !== undefined ? elig.chainStatus === 1 : live === 'open';
    let canPick = false, msg = '';

    if (!open) {
      msg = live === 'upcoming' 
        ? '<div class="notice warn" style="background:var(--warn-soft); border-left:4px solid var(--warn); padding:12px; border-radius:8px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-clock" style="color:var(--warn);"></i> Hòm phiếu chưa mở.</div>'
        : '<div class="notice info" style="background:var(--accent-soft); border-left:4px solid var(--accent); padding:12px; border-radius:8px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-lock" style="color:var(--accent);"></i> Hòm phiếu đã đóng.</div>';
    } else if (!me) {
      msg = '<div class="notice info" style="background:#f1f5f9; border:1px solid var(--glass-border); padding:16px; border-radius:12px; display:flex; align-items:center; justify-content:space-between;"><span>Kết nối ví để bỏ phiếu.</span> <button id="btnConn2" class="btn btn-sm"><i class="fa-solid fa-wallet"></i> Kết nối</button></div>';
    } else if (elig.error) {
      msg = `<div class="notice error" style="background:var(--danger-soft); border-left:4px solid var(--danger); padding:12px; border-radius:8px; color:var(--danger);"><i class="fa-solid fa-circle-exclamation"></i> Lỗi blockchain: ${App.esc(elig.error)}</div>`;
    } else if (elig.voted) {
      const labels = myChoices ? myChoices.choice_labels.map((l) => `<b>${App.esc(l)}</b>`).join(', ') : '';
      msg = `<div class="notice ok" style="background:var(--ok-soft); border-left:4px solid var(--ok); padding:12px 16px; border-radius:8px;">
        <div style="display:flex; align-items:center; gap:8px; color:var(--ok); margin-bottom:8px;"><i class="fa-solid fa-circle-check"></i> <b>Bạn đã bỏ phiếu thành công!</b></div>
        ${labels ? `Đã chọn: ${labels}` : ''}
        ${myChoices ? `<br><a href="/verify/?tx=${App.esc(myChoices.tx_hash)}" style="display:inline-block; margin-top:8px; font-weight:600;"><i class="fa-solid fa-magnifying-glass"></i> Xác minh phiếu ngay</a>` : ''}</div>`;
    } else if (E.is_private && !elig.whitelisted) {
      msg = '<div class="notice warn" style="background:var(--warn-soft); border-left:4px solid var(--warn); padding:12px; border-radius:8px; display:flex; align-items:center; gap:8px;"><i class="fa-solid fa-lock" style="color:var(--warn);"></i> Ví của bạn không nằm trong danh sách cử tri (Whitelist).</div>';
    } else {
      canPick = true;
    }
    box.innerHTML = msg;
    const conn = $('btnConn2');
    if (conn) conn.addEventListener('click', () => App.connect().then(refreshAll).catch((e) => { if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error'); }));

    if (!canPick) selected.clear();
    
    // Giao diện thẻ ứng viên (Light Theme)
    $('options').innerHTML = E.options.map((o) => {
      const sel = selected.has(o.id), full = canPick && !sel && selected.size >= E.max_choices && E.max_choices > 1;
      
      // Định dạng style inline để đảm bảo ăn CSS 100% nếu class bị đè
      const optStyle = `background: #ffffff; border: 2px solid ${sel ? 'var(--accent)' : 'var(--glass-border)'}; border-radius: 16px; padding: 16px; display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; cursor: ${canPick && !full ? 'pointer' : 'default'}; transition: all 0.2s ease; position: relative; box-shadow: ${sel ? '0 4px 16px rgba(37,99,235,0.2)' : 'var(--shadow-sm)'}; opacity: ${full || (!canPick && !sel && elig.voted) ? '0.5' : '1'};`;
      
      return `<div class="opt ${sel ? 'selected' : ''} ${canPick ? '' : 'locked'} ${full ? 'disabled' : ''}" data-id="${o.id}" style="${optStyle}">
        ${canPick ? `<div class="tick" style="position:absolute; top:12px; right:12px; width:24px; height:24px; border-radius:50%; border:2px solid ${sel ? 'var(--accent)' : '#cbd5e1'}; background:${sel ? 'var(--accent)' : 'transparent'}; color:#fff; display:flex; align-items:center; justify-content:center;">${sel ? '<i class="fa-solid fa-check" style="font-size:12px;"></i>' : ''}</div>` : ''}
        
        ${o.image_url ? `<img src="${App.esc(o.image_url)}" alt="" style="width:80px; height:80px; border-radius:50%; object-fit:cover; box-shadow:var(--shadow-sm);" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display='none'">` : '<div style="width:80px; height:80px; border-radius:50%; background:#f1f5f9; display:flex; align-items:center; justify-content:center; color:var(--text-muted);"><i class="fa-solid fa-user fa-2x"></i></div>'}
        
        <div class="title" style="font-weight:700; font-size:1.1rem; color:var(--text-main);">${App.esc(o.label)}</div>
        ${o.description ? `<div class="muted small" style="font-size:0.9rem;">${App.esc(o.description)}</div>` : ''}
      </div>`;
    }).join('');

    $('pickbar').classList.toggle('hidden', !canPick);
    if(canPick) {
      $('pickbar').style.cssText = 'background: #ffffff; border: 1px solid var(--accent); padding: 16px 24px; border-radius: 12px; display: flex; justify-content: space-between; align-items: center; margin-top: 24px; box-shadow: 0 -4px 20px rgba(0,0,0,0.05); position: sticky; bottom: 24px; z-index: 10;';
    }
    
    $('pickCount').textContent = `${selected.size}/${E.max_choices}`;
    $('pickRule').textContent = E.max_choices === 1 ? 'chọn 1' : `chọn từ 1 đến ${E.max_choices}`;
    $('btnVote').disabled = !(canPick && selected.size >= 1 && selected.size <= E.max_choices);
  }

  function renderResults() {
    const max = Math.max(0, ...E.options.map((o) => o.votes));
    const items = E.options.map((o) => {
      const isLeader = max > 0 && o.votes === max;
      return `
      <div class="result ${isLeader ? 'leader' : ''}" style="margin-bottom:16px; background:#ffffff; border:1px solid ${isLeader ? 'var(--accent)' : 'var(--glass-border)'}; border-radius:12px; padding:16px; box-shadow:var(--shadow-sm);">
        <div class="top" style="display:flex; justify-content:space-between; margin-bottom:8px; font-weight:600;">
            <span style="color:var(--text-main);">${isLeader ? '<i class="fa-solid fa-trophy" style="color:#fbbf24; margin-right:6px;"></i>' : ''}${App.esc(o.label)}</span>
            <span style="color:${isLeader ? 'var(--accent)' : 'var(--text-muted)'};">${o.votes} phiếu (${o.percent}%)</span>
        </div>
        <div class="bar" style="height:10px; background:#f1f5f9; border-radius:999px; overflow:hidden;">
            <div style="height:100%; width:${Math.min(100, o.percent)}%; background:${isLeader ? 'var(--accent)' : '#cbd5e1'}; border-radius:999px; transition:width 1s ease;"></div>
        </div>
      </div>`
    }).join('');
    
    const wl = E.is_private ? `<div style="text-align:center;"><b style="font-size:1.5rem; color:var(--text-main); display:block;">${E.whitelist_count}</b><span class="small muted">Ví được phép</span></div>` : '';
    
    $('pane-results').innerHTML = `
      <div class="stat" style="display:flex; justify-content:space-around; background:#f8fafc; padding:20px; border-radius:12px; border:1px solid var(--glass-border); margin-bottom:24px;">
          <div style="text-align:center;"><b style="font-size:1.5rem; color:var(--accent); display:block;">${E.total_voters}</b><span class="small muted">Cử tri đã bỏ phiếu</span></div>
          ${wl}
      </div>
      ${items}
      ${E.max_choices > 1 ? '<p class="small muted" style="text-align:center; margin-top:16px;"><i class="fa-solid fa-circle-info"></i> Tổng phần trăm có thể vượt 100% do cử tri được chọn nhiều lựa chọn.</p>' : ''}`;
  }

  // ---------------------------------------------------------------- tương tác bỏ phiếu
  $('options').addEventListener('click', (ev) => {
    const card = ev.target.closest('.opt');
    if (!card || card.classList.contains('locked')) return;
    const id = +card.dataset.id, max = E.max_choices;
    if (selected.has(id)) selected.delete(id);
    else if (max === 1) { selected.clear(); selected.add(id); }
    else if (selected.size >= max) { App.toast(`Chỉ được chọn tối đa ${max} lựa chọn.`, 'error'); return; }
    else selected.add(id);
    renderVoteCard(liveStatus());
  });

  const modalHTML = `
    <div id="voteModal" class="modal-overlay" style="position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(15,23,42,0.4); backdrop-filter:blur(4px); z-index:999; display:flex; align-items:center; justify-content:center;">
      <div class="modal-content" style="background:#ffffff; padding:32px; border-radius:16px; width:100%; max-width:420px; box-shadow:var(--shadow-lg);">
        <h3 id="vmTitle" style="color:var(--text-main); margin-bottom:24px; text-align:center;">Xác nhận</h3>
        <div id="vmBody" style="margin-bottom:24px; color:var(--text-main);"></div>
        <div id="vmActions" class="row" style="display:flex; justify-content:center; gap:12px;">
          <button id="vmCancel" class="btn btn-ghost">Hủy</button>
          <button id="vmConfirm" class="btn btn-primary"><i class="fa-solid fa-check"></i> Ký giao dịch</button>
        </div>
      </div>
    </div>
  `;

  function openConfirmModal(title, bodyHTML, onConfirm) {
    let m = $('voteModal');
    if (m) m.remove();
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    
    $('vmTitle').innerHTML = `<i class="fa-solid fa-shield-halved" style="color:var(--accent); margin-right:8px;"></i> ${title}`;
    $('vmBody').innerHTML = bodyHTML;
    
    $('vmCancel').onclick = () => $('voteModal').remove();
    $('vmConfirm').onclick = () => {
      $('vmActions').classList.add('hidden');
      onConfirm();
    };
  }

  function setModalProgress(stepIndex, text, status = 'processing') {
    let stepsContainer = $('vmSteps');
    if (!stepsContainer) {
       $('vmBody').innerHTML = `<div id="vmSteps" class="progress-steps" style="display:flex; flex-direction:column; gap:12px;"></div>`;
       stepsContainer = $('vmSteps');
    }
    
    if (status === 'error' || status === 'cancelled') {
       $('vmTitle').textContent = status === 'error' ? 'Giao dịch thất bại' : 'Đã huỷ bỏ';
       const oldSpinner = stepsContainer.querySelector('.fa-spinner');
       if (oldSpinner) {
           oldSpinner.outerHTML = status === 'error' ? '<i class="fa-solid fa-circle-xmark"></i>' : '<i class="fa-solid fa-circle-pause"></i>';
           oldSpinner.closest('div').style.color = status === 'error' ? 'var(--danger)' : 'var(--muted)';
       }
       const color = status === 'error' ? 'var(--danger)' : 'var(--muted)';
       const icon = status === 'error' ? '<i class="fa-solid fa-circle-xmark"></i>' : '<i class="fa-solid fa-circle-pause"></i>';
       stepsContainer.insertAdjacentHTML('beforeend', `<div style="display:flex; align-items:center; gap:12px; color:${color}; font-weight:600;">${icon} <span>${App.esc(text)}</span></div>`);
       $('vmActions').classList.remove('hidden');
       $('vmConfirm').classList.add('hidden');
       $('vmCancel').textContent = 'Đóng';
       return;
    }
    
    const oldSpinner = stepsContainer.querySelector('.fa-spinner');
    if (oldSpinner) {
        oldSpinner.outerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--ok);"></i>';
        oldSpinner.closest('div').style.color = 'var(--text-muted)';
        oldSpinner.closest('div').style.fontWeight = '500';
    }
    
    if (stepIndex === 2) {
       $('vmTitle').textContent = 'Hoàn tất';
       stepsContainer.insertAdjacentHTML('beforeend', `<div style="display:flex; align-items:center; gap:12px; color:var(--text-muted); font-weight:500;"><i class="fa-solid fa-circle-check" style="color:var(--ok);"></i> <span>${App.esc(text)}</span></div>`);
       setTimeout(() => { const m = $('voteModal'); if(m) m.remove(); }, 3000);
    } else {
       $('vmTitle').textContent = 'Đang xử lý...';
       stepsContainer.insertAdjacentHTML('beforeend', `<div style="display:flex; align-items:center; gap:12px; color:var(--accent); font-weight:600;"><i class="fa-solid fa-spinner fa-spin"></i> <span>${App.esc(text)}</span></div>`);
    }
  }

  $('btnVote').addEventListener('click', async () => {
    const ids = [...selected].sort((a, b) => a - b);
    if (!ids.length || ids.length > E.max_choices) return;
    const names = ids.map((i) => E.options.find((o) => o.id === i).label).join(', ');
    
    openConfirmModal(
      'Xác nhận gửi phiếu',
      `<div style="background:#f8fafc; padding:16px; border-radius:8px; border:1px solid var(--glass-border); margin-bottom:16px;">
        <span class="small muted">Bạn đang gửi phiếu cho:</span><br>
        <b style="font-size:1.1rem; color:var(--accent);">${App.esc(names)}</b>
      </div>
      <div class="notice warn" style="background:var(--warn-soft); border-left:4px solid var(--warn); padding:12px; border-radius:8px; font-size:0.9rem;">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--warn);"></i> Phiếu bầu sẽ được ghi lên Blockchain và <b>KHÔNG THỂ</b> sửa hoặc thu hồi.
      </div>`,
      async () => {
      $('btnVote').disabled = true;
      let rc = null;
      try {
        setModalProgress(0, 'Vui lòng xác nhận giao dịch trong ví MetaMask...');
        await App.ensureChain();
        const c = App.electionContract(ADDR, App.state.signer);
        const tx = await c.vote(ids);
        
        setModalProgress(1, 'Đang đợi Blockchain xác nhận (khoảng 12s)...');
        rc = await tx.wait();
        
        setModalProgress(2, 'Ghi nhận phiếu bầu thành công!');
        
        selected.clear();
        
        ids.forEach(id => {
          const opt = E.options.find(o => o.id === id);
          if (opt) opt.votes += 1;
        });
        E.total_voters += 1;
        E.options.forEach(o => o.percent = Math.round((o.votes / E.total_voters) * 100) || 0);
        renderResults();

        $('voteStatus').innerHTML = `<div class="notice ok" style="background:var(--ok-soft); border-left:4px solid var(--ok); padding:12px 16px; border-radius:8px;">
          <div style="display:flex; align-items:center; gap:8px; color:var(--ok); margin-bottom:8px;"><i class="fa-solid fa-circle-check"></i> <b>Phiếu của bạn đã được ghi lên blockchain.</b></div>
          <a href="/verify/?tx=${App.esc(rc.hash)}" style="display:inline-block; font-weight:600;"><i class="fa-solid fa-magnifying-glass"></i> Xác minh phiếu ngay</a></div>`;
        await refreshEligibility();
        setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
      } catch (e) {
        if (e.code === 'ACTION_REJECTED' || e.code === 4001) {
          setModalProgress(-1, 'Đã từ chối xác nhận trên ví', 'cancelled');
        } else {
          setModalProgress(-1, App.errMsg(e), 'error');
        }
      }
      renderVoteCard(liveStatus());
    });
  });

  // ---------------------------------------------------------------- bảng điều khiển chủ sở hữu
  function renderOwner(live, isOwner) {
    $('ownerPanel').classList.toggle('hidden', !isOwner);
    if (!isOwner) return;
    const notFinished = live === 'open' || live === 'upcoming';
    $('ownerWhitelist').classList.toggle('hidden', !(E.is_private && notFinished));
    $('ownerSchedule').classList.toggle('hidden', live !== 'upcoming');
    $('ownerClose').classList.toggle('hidden', !notFinished);
    if (!notFinished) $('ownerPanel').classList.add('hidden');
  }

  function parseAddresses(text) {
    const valid = [], invalid = [], seen = new Set();
    for (const p of text.split(/[\s,;]+/).filter(Boolean)) {
      if (!ethers.isAddress(p)) { invalid.push(p); continue; }
      const a = ethers.getAddress(p);
      if (!seen.has(a)) { seen.add(a); valid.push(a); }
    }
    return { valid, invalid };
  }

  $('wlInput').addEventListener('input', () => {
    const { valid, invalid } = parseAddresses($('wlInput').value);
    $('wlHint').innerHTML = valid.length || invalid.length ? `<span style="color:var(--ok);"><i class="fa-solid fa-check"></i> ${valid.length} hợp lệ</span>${invalid.length ? ` <span style="color:var(--danger); margin-left:8px;"><i class="fa-solid fa-xmark"></i> ${invalid.length} lỗi</span>` : ''}` : '';
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
    } catch (_) { }
    $('btnWl').disabled = false;
  });

  $('btnResched').addEventListener('click', async () => {
    try {
      await App.ensureChain();
      const c = App.electionContract(ADDR, App.state.signer);
      await App.tx('Dời lịch', () => c.reschedule(App.toUnix($('rsStart').value), App.toUnix($('rsEnd').value)));
      setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
    } catch (_) { }
  });

  $('btnClose').addEventListener('click', async () => {
    openConfirmModal(
      'Đóng hòm phiếu khẩn cấp',
      `<div class="notice warn" style="background:var(--danger-soft); border-left:4px solid var(--danger); padding:12px; border-radius:8px;">
        <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger);"></i> <b>CẢNH BÁO TỐI QUAN TRỌNG</b><br><br>
        Đóng hòm phiếu <b>NGAY BÂY GIỜ?</b><br>Sau khi đóng sẽ không ai bỏ phiếu được nữa và <b>KHÔNG THỂ</b> mở lại.
      </div>`,
      async () => {
        try {
          setModalProgress(0, 'Đang chờ bạn xác nhận trong ví...');
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          const tx = await c.closeEarly();
          setModalProgress(1, 'Đang đợi Blockchain xác nhận...');
          await tx.wait();
          setModalProgress(2, 'Đã đóng hòm phiếu vĩnh viễn!');
          setTimeout(refreshAll, 2500); setTimeout(refreshAll, 7000);
        } catch (e) {
          if (e.code === 'ACTION_REJECTED' || e.code === 4001) setModalProgress(-1, 'Đã hủy', 'cancelled');
          else setModalProgress(-1, App.errMsg(e), 'error');
        }
      }
    );
  });

  // ---------------------------------------------------------------- tab: phiếu đã bỏ / whitelist
  async function loadVoters() {
    const el = $('pane-voters');
    try {
      const d = await App.api(`/api/elections/${ADDR}/voters/?page=${pages.voters}&page_size=15`);
      el.innerHTML = d.votes.length ? `<div class="table-wrap" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead style="background:#f8fafc; border-bottom:2px solid var(--glass-border);"><tr><th style="padding:12px;">Ví cử tri</th><th style="padding:12px;">Đã chọn</th><th style="padding:12px;">Thời gian</th><th style="padding:12px;">Mã giao dịch</th></tr></thead>
        <tbody>
        ${d.votes.map((v) => `<tr style="border-bottom:1px solid var(--glass-border);"><td style="padding:12px;">${App.addrLink(v.voter)}</td><td style="padding:12px; font-weight:500;">${v.choice_labels.map(App.esc).join(', ')}</td>
          <td style="padding:12px; color:var(--text-muted);">${App.esc(App.fmtDate(v.time))}</td><td style="padding:12px;"><a href="/verify/?tx=${App.esc(v.tx_hash)}">${App.esc(App.short(v.tx_hash))}</a></td></tr>`).join('')}
        </tbody></table></div><div class="pager" id="vPager" style="margin-top:16px; display:flex; justify-content:center;"></div>`
        : '<div class="empty" style="text-align:center; padding:40px; color:var(--text-muted);"><i class="fa-solid fa-box-open fa-3x" style="color:#cbd5e1; margin-bottom:16px; display:block;"></i> Chưa có cử tri nào bỏ phiếu.</div>';
      const pg = $('vPager'); if (pg) ElectionCards.pager(pg, d.page, d.pages, (n) => { pages.voters = n; loadVoters(); });
    } catch (e) { el.innerHTML = `<div class="notice error">${App.esc(e.message)}</div>`; }
  }

  async function loadWhitelist() {
    const el = $('pane-whitelist');
    try {
      const d = await App.api(`/api/elections/${ADDR}/whitelist/?page=${pages.whitelist}&page_size=50`);
      const canRemove = App.sameAddr(App.state.address, E.owner) && ['open', 'upcoming'].includes(liveStatus());
      el.innerHTML = d.entries.length ? `<p class="small muted" style="margin-bottom:16px;">Tổng cộng <b>${d.total}</b> ví được cấp quyền.</p><div class="table-wrap" style="overflow-x:auto;"><table style="width:100%; border-collapse:collapse; text-align:left;">
        <thead style="background:#f8fafc; border-bottom:2px solid var(--glass-border);"><tr><th style="padding:12px;">Ví</th><th style="padding:12px;">Trạng thái</th><th style="padding:12px; text-align:right;">Thao tác</th></tr></thead>
        <tbody>
        ${d.entries.map((w) => `<tr style="border-bottom:1px solid var(--glass-border);"><td style="padding:12px; font-family:monospace;">${App.addrLink(w.address)}</td><td style="padding:12px;">${w.voted ? '<span style="color:var(--ok);"><i class="fa-solid fa-check"></i> Đã bỏ phiếu</span>' : '<span style="color:var(--warn);"><i class="fa-solid fa-clock"></i> Chưa bỏ</span>'}</td>
          <td style="padding:12px; text-align:right;">${canRemove && !w.voted ? `<button class="btn btn-sm btn-ghost" style="color:var(--danger); border-color:var(--danger-soft);" data-rm="${App.esc(w.address)}"><i class="fa-solid fa-trash"></i> Gỡ</button>` : ''}</td></tr>`).join('')}
        </tbody></table></div><div class="pager" id="wPager" style="margin-top:16px; display:flex; justify-content:center;"></div>`
        : '<div class="empty" style="text-align:center; padding:40px; color:var(--text-muted);">Chưa có cử tri nào trong danh sách.</div>';
      const pg = $('wPager'); if (pg) ElectionCards.pager(pg, d.page, d.pages, (n) => { pages.whitelist = n; loadWhitelist(); });
      el.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', async () => {
        try {
          await App.ensureChain();
          const c = App.electionContract(ADDR, App.state.signer);
          await App.tx('Gỡ cử tri', () => c.removeFromWhitelist([b.dataset.rm]));
          setTimeout(refreshAll, 2500);
        } catch (_) { }
      }));
    } catch (e) { el.innerHTML = `<div class="notice error">${App.esc(e.message)}</div>`; }
  }

  document.querySelectorAll('.tab-btn').forEach((t) => t.addEventListener('click', () => {
    activeTab = t.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach((x) => {
        x.classList.toggle('active', x === t);
        x.style.background = x === t ? 'var(--accent)' : 'transparent';
        x.style.color = x === t ? '#fff' : 'var(--text-muted)';
    });
    ['results', 'voters', 'whitelist'].forEach((n) => $('pane-' + n).classList.toggle('hidden', n !== activeTab));
    if (activeTab === 'voters') loadVoters();
    if (activeTab === 'whitelist') loadWhitelist();
  }));

  // ---------------------------------------------------------------- khởi động
  async function setupOnChainListener() {
    if (!App.hasWallet()) return;
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const c = App.electionContract(ADDR, provider);
      c.on("VoteCast", (voter, choices) => {
        if (!App.sameAddr(voter, App.state.address)) {
          App.toast("Vừa có phiếu bầu mới từ cử tri khác!", "info");
          setTimeout(refreshAll, 1000);
        }
      });
    } catch (e) { }
  }

  for (let tries = 0; ; tries++) {
    try { await loadElection(); break; } catch (e) {
      if (e.status === 404 && isNew && tries < 40) {
        $('loading').classList.add('hidden'); $('syncing').classList.remove('hidden');
        await sleep(3000); continue;
      }
      $('loading').classList.add('hidden'); $('syncing').classList.add('hidden');
      $('fatal').classList.remove('hidden');
      $('fatal').innerHTML = e.status === 404
        ? '<i class="fa-solid fa-triangle-exclamation"></i> Không tìm thấy hòm phiếu này. Nếu vừa tạo, hãy thử tải lại (hệ thống cần đồng bộ từ blockchain).'
        : e.message;
      return;
    }
  }
  $('loading').classList.add('hidden'); $('syncing').classList.add('hidden'); $('content').classList.remove('hidden');
  await refreshEligibility();
  render();
  setupOnChainListener();
  setInterval(updateCountdown, 1000);
  setInterval(refreshAll, 60000);
  App.watch(ADDR.toLowerCase(), App.debounce(refreshAll, 600));
})();