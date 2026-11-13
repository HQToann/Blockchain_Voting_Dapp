/* Tiện ích dùng chung: API, ví Web3, Giao dịch, Realtime & Định dạng UI */
(function () {
  'use strict';
  const App = (window.App = {});
  App.cfg = null;
  App.state = { provider: null, signer: null, address: null };

  // ---------------------------------------------------------------- shorthand
  // Tránh lặp `document.getElementById` trong mọi page JS
  App.$ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------- định dạng
  App.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  App.fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
  App.sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  App.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  App.toUnix = (localValue) => (localValue ? Math.floor(new Date(localValue).getTime() / 1000) : 0);
  App.fmtDuration = (ms) => {
    if (ms <= 0) return '0 giây';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s % 60} giây` : `${s} giây`;
  };
  App.txLink = (h) => `<a class="mono" target="_blank" rel="noopener" href="${App.esc(App.cfg.explorer_url)}/tx/${App.esc(h)}">${App.esc(App.short(h))}</a>`;
  App.addrLink = (a) => `<a class="mono" target="_blank" rel="noopener" href="${App.esc(App.cfg.explorer_url)}/address/${App.esc(a)}">${App.esc(App.short(a))}</a>`;

  // ---------------------------------------------------------------- badge helpers (dùng cho trang style.css cũ nếu có)
  const STATUS = {
    open:     { label: 'Đang mở',      icon: 'lock_open',        color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0' },
    upcoming: { label: 'Sắp diễn ra',  icon: 'calendar_today',   color: '#d97706', bg: '#fef3c7', border: '#fde68a' },
    ended:    { label: 'Đã kết thúc',  icon: 'flag',              color: '#475569', bg: '#f1f5f9', border: '#cbd5e1' },
    closed:   { label: 'Đã đóng sớm', icon: 'do_not_disturb_on', color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  };
  App.statusText = (s) => STATUS[s] ? STATUS[s].label : s;
  App.statusBadge = (s) => {
    const t = STATUS[s] || { label: s, icon: 'info', color: '#2563eb', bg: '#eff6ff', border: '#bfdbfe' };
    return `<span class="badge" style="background:${t.bg};color:${t.color};border:1px solid ${t.border};font-weight:600;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">${t.icon}</span>${App.esc(t.label)}</span>`;
  };
  App.kindBadge = (k) => {
    const icon = k === 1 ? 'quiz' : 'how_to_vote';
    const label = k === 1 ? 'Lấy ý kiến' : 'Bầu ứng viên';
    return `<span class="badge" style="background:#f8fafc;color:#334155;border:1px solid #cbd5e1;font-weight:500;display:inline-flex;align-items:center;gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;color:#2563eb;">${icon}</span>${label}</span>`;
  };

  // ---------------------------------------------------------------- toast — dùng Material Symbols
  App.toast = (msg, type = 'info', ms = 4500) => {
    const ICONS = { ok: 'check_circle', error: 'error', warn: 'warning', info: 'info' };
    const COLORS = { ok: '#16a34a', error: '#dc2626', warn: '#d97706', info: '#2563eb' };
    const icon = ICONS[type] || ICONS.info;
    const color = COLORS[type] || COLORS.info;

    const el = document.createElement('div');
    el.className = 'toast';
    el.style.cssText = `background:#ffffff;color:#1e293b;border-left:4px solid ${color};padding:14px 18px;border-radius:10px;box-shadow:0 10px 25px -5px rgba(0,0,0,0.1),0 8px 10px -6px rgba(0,0,0,0.1);display:flex;align-items:center;gap:10px;font-weight:500;font-size:0.9rem;animation:slideIn 0.3s ease forwards;min-width:260px;max-width:380px;`;
    el.innerHTML = `<span class="material-symbols-outlined" style="color:${color};font-size:22px;flex-shrink:0;">${icon}</span><span style="flex:1;">${App.esc(msg)}</span>`;

    const container = document.getElementById('toasts');
    if (container) container.appendChild(el);
    if (ms) setTimeout(() => {
      el.style.animation = 'slideOut 0.3s ease forwards';
      setTimeout(() => el.remove(), 300);
    }, ms);
    return el;
  };

  // ---------------------------------------------------------------- API
  const cookie = (n) => (document.cookie.split('; ').find((c) => c.startsWith(n + '=')) || '').split('=')[1];
  App.api = async (path, { method = 'GET', json, form } = {}) => {
    const headers = {};
    let body;
    if (method !== 'GET') headers['X-CSRFToken'] = decodeURIComponent(cookie('csrftoken') || '');
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(json); }
    if (form) body = form;
    const res = await fetch(path, { method, headers, body, credentials: 'same-origin' });
    let data = null;
    try { data = await res.json(); } catch (_) { /* không phải JSON */ }
    if (!res.ok) { const e = new Error((data && data.error) || `Lỗi ${res.status}`); e.status = res.status; throw e; }
    return data;
  };
  App.loadConfig = async () => (App.cfg = App.cfg || (await App.api('/api/config/')));

  // ---------------------------------------------------------------- lỗi dễ hiểu
  App.errMsg = (e) => {
    if (!e) return 'Lỗi không xác định';
    if (e.code === 'ACTION_REJECTED' || e.code === 4001) return 'Bạn đã từ chối ký ví.';
    const reason = e.reason || (e.revert && e.revert.args && e.revert.args[0]) || (e.info && e.info.error && e.info.error.message) || '';
    if (reason) return String(reason).replace(/^execution reverted: /, '');
    if (e.code === 'INSUFFICIENT_FUNDS') return `Ví không đủ ${App.cfg ? App.cfg.currency : 'ETH'} trả phí mạng.`;
    return e.shortMessage || e.message || String(e);
  };

  // ---------------------------------------------------------------- tiện ích dùng chung nhiều trang

  // Cập nhật phí Gas từ Sepolia RPC — dùng chung bởi mọi page JS (tránh copy-paste)
  App.updateGasPrice = async () => {
    const gasEl = App.$('gasPrice');
    if (!gasEl) return;
    try {
      let p = App.state.provider;
      if (!p && App.cfg && App.cfg.rpc_url) {
        p = new ethers.JsonRpcProvider(App.cfg.rpc_url);
      }
      if (p) {
        const fee = await p.getFeeData();
        if (fee && fee.gasPrice) {
          const gwei = Math.max(1, Math.round(Number(ethers.formatUnits(fee.gasPrice, 'gwei'))));
          gasEl.textContent = `${gwei} Gwei`;
        }
      }
    } catch (_) {
      gasEl.textContent = '15 Gwei';
    }
  };

  // Parse & validate danh sách địa chỉ Ethereum từ textarea — dùng chung create.js & detail.js
  App.parseAddresses = (raw) => {
    const valid = [], invalid = [], seen = new Set();
    for (const p of String(raw || '').split(/[\s,;]+/).filter(Boolean)) {
      if (!ethers.isAddress(p)) { invalid.push(p); continue; }
      const a = ethers.getAddress(p);
      if (!seen.has(a)) { seen.add(a); valid.push(a); }
    }
    return { valid, invalid };
  };

  // ---------------------------------------------------------------- ví
  App.hasWallet = () => typeof window.ethereum !== 'undefined';
  const hexChain = () => '0x' + App.cfg.chain_id.toString(16);

  App.ensureChain = async () => {
    const cur = await window.ethereum.request({ method: 'eth_chainId' });
    if (cur.toLowerCase() === hexChain()) return;
    try {
      await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hexChain() }] });
    } catch (e) {
      if (e.code !== 4902) throw e;
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hexChain(), chainName: App.cfg.chain_name, rpcUrls: [App.cfg.rpc_url],
                   nativeCurrency: { name: App.cfg.currency, symbol: App.cfg.currency, decimals: 18 },
                   blockExplorerUrls: [App.cfg.explorer_url] }],
      });
    }
  };

  const setWallet = async () => {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    App.state = { provider, signer, address: await signer.getAddress() };
    const b = App.$('btnWallet');
    if (b) {
      const addrEl = App.$('walletAddress');
      const dotEl = App.$('walletDot');
      if (addrEl) {
        addrEl.textContent = App.short(App.state.address);
        if (dotEl) dotEl.className = 'w-2.5 h-2.5 rounded-full bg-tertiary-container';
      } else {
        // Fallback cho layout cũ
        b.innerHTML = `<span class="material-symbols-outlined" style="color:#10b981;font-size:18px;">check_circle</span> ${App.short(App.state.address)}`;
      }
      b.title = App.state.address;
    }
  };

  App.connect = async () => {
    await App.loadConfig();
    if (!App.hasWallet()) {
      App.toast('Vui lòng cài đặt ví Web3 (như MetaMask) để sử dụng.', 'error', 7000);
      throw new Error('NO_WALLET');
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await App.ensureChain();
    await setWallet();
    return App.state;
  };

  App.ensureLogin = async () => {
    const st = App.state.address ? App.state : await App.connect();
    const me = await App.api('/api/auth/me/');
    if (me.address && App.sameAddr(me.address, st.address)) return;
    const n = await App.api('/api/auth/nonce/');
    const signature = await st.signer.signMessage(n.message);
    await App.api('/api/auth/verify/', { method: 'POST', json: { address: st.address, signature, nonce: n.nonce } });
  };

  // Thực thi giao dịch blockchain với toast trạng thái — dùng Material Symbols
  App.tx = async (label, fn) => {
    const t = App.toast(`${label}: Xác nhận trong ví...`, 'info', 0);
    try {
      const tx = await fn();
      t.innerHTML = `<span class="material-symbols-outlined" style="color:#2563eb;font-size:22px;flex-shrink:0;animation:spin 1s linear infinite;">progress_activity</span><span style="flex:1;">${label}: Đang chờ Blockchain xác nhận...</span>`;
      const receipt = await tx.wait();
      t.remove();
      App.toast(`${label}: Giao dịch thành công!`, 'ok');
      return receipt;
    } catch (e) {
      t.remove();
      App.toast(`${label} thất bại: ${App.errMsg(e)}`, 'error', 9000);
      throw e;
    }
  };

  App.electionContract = (address, signerOrProvider) => new ethers.Contract(address, window.ELECTION_ABI, signerOrProvider);
  App.factoryContract = (signerOrProvider) => new ethers.Contract(App.cfg.factory_address, window.FACTORY_ABI, signerOrProvider);

  // ---------------------------------------------------------------- realtime WebSocket
  App.watch = (room, cb) => {
    let ws, closed = false;
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/election/${room}/`);
      ws.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch (_) { } };
      ws.onclose = () => { if (!closed) setTimeout(open, 3000); };
    };
    open();
    return () => { closed = true; if (ws) ws.close(); };
  };

  // ---------------------------------------------------------------- khởi tạo trang
  App.init = async () => {
    const banner = App.$('banner');
    try {
      await App.loadConfig();
    } catch (e) {
      if (banner) banner.innerHTML = `<div style="background:#fef2f2;border-left:4px solid #dc2626;padding:12px 16px;border-radius:8px;display:flex;align-items:center;gap:10px;"><span class="material-symbols-outlined" style="color:#dc2626;">dns</span><span>Lỗi: Không thể kết nối Backend. Hãy kiểm tra lại Server.</span></div>`;
      throw e;
    }
    if (!App.cfg.factory_address && banner) {
      banner.innerHTML = `<div style="background:#fef3c7;border-left:4px solid #d97706;padding:12px 16px;border-radius:8px;display:flex;align-items:center;gap:10px;"><span class="material-symbols-outlined" style="color:#d97706;">warning</span><b>Hệ thống chưa cấu hình Smart Contract.</b></div>`;
    }
    const footerContract = App.$('footerContract');
    if (footerContract && App.cfg && App.cfg.factory_address) {
      footerContract.textContent = `Contract: ${App.short(App.cfg.factory_address)}`;
    }
    const btn = App.$('btnWallet');
    if (btn) btn.addEventListener('click', () => App.connect().catch((e) => { if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error'); }));
    if (App.hasWallet()) {
      window.ethereum.on && window.ethereum.on('accountsChanged', () => location.reload());
      window.ethereum.on && window.ethereum.on('chainChanged', () => location.reload());
      try {
        const accts = await window.ethereum.request({ method: 'eth_accounts' });
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        if (accts.length && chain.toLowerCase() === hexChain()) await setWallet();
      } catch (_) { }
    }
    // Khởi động cập nhật gas price và lặp 30s
    App.updateGasPrice();
    setInterval(App.updateGasPrice, 30000);

    // Toggle menu điều hướng trên thiết bị di động
    const btnMob = App.$('btnMobileNav');
    const menuMob = App.$('mobileNavMenu');
    if (btnMob && menuMob) {
      btnMob.addEventListener('click', () => {
        menuMob.classList.toggle('hidden');
      });
    }

    return App;
  };
})();
