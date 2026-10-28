/* Tiện ích dùng chung cho mọi trang: gọi API, kết nối ví, gửi giao dịch, realtime. */
(function () {
  'use strict';
  const App = (window.App = {});
  App.cfg = null;
  App.state = { provider: null, signer: null, address: null };

  // ---------------------------------------------------------------- định dạng
  App.esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  App.short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
  App.fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('vi-VN') : '—');
  App.sameAddr = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
  const STATUS = { open: 'Đang mở', upcoming: 'Sắp diễn ra', ended: 'Đã kết thúc', closed: 'Chủ đã đóng' };
  App.statusText = (s) => STATUS[s] || s;
  App.statusBadge = (s) => `<span class="badge ${App.esc(s)}">${App.esc(STATUS[s] || s)}</span>`;
  App.kindBadge = (k) => `<span class="badge kind">${k === 1 ? '📋 Vấn đề' : '👤 Ứng viên'}</span>`;
  App.debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  App.toUnix = (localValue) => (localValue ? Math.floor(new Date(localValue).getTime() / 1000) : 0);
  App.fmtDuration = (ms) => {
    if (ms <= 0) return '0 giây';
    const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    return d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : m ? `${m} phút ${s % 60} giây` : `${s} giây`;
  };
  App.txLink = (h) => `<a class="mono" target="_blank" rel="noopener" href="${App.esc(App.cfg.explorer_url)}/tx/${App.esc(h)}">${App.esc(App.short(h))}</a>`;
  App.addrLink = (a) => `<a class="mono" target="_blank" rel="noopener" href="${App.esc(App.cfg.explorer_url)}/address/${App.esc(a)}">${App.esc(App.short(a))}</a>`;

  // ---------------------------------------------------------------- toast
  App.toast = (msg, type = 'info', ms = 4500) => {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    document.getElementById('toasts').appendChild(el);
    if (ms) setTimeout(() => el.remove(), ms);
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
    if (e.code === 'ACTION_REJECTED' || e.code === 4001) return 'Bạn đã từ chối trong ví.';
    const reason = e.reason || (e.revert && e.revert.args && e.revert.args[0]) || (e.info && e.info.error && e.info.error.message) || '';
    if (reason) return String(reason).replace(/^execution reverted: /, '');
    if (e.code === 'INSUFFICIENT_FUNDS') return `Ví không đủ ${App.cfg ? App.cfg.currency : 'ETH'} để trả phí gas.`;
    return e.shortMessage || e.message || String(e);
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
      if (e.code !== 4902) throw e;     // 4902 = ví chưa có mạng này -> đề nghị thêm
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [{ chainId: hexChain(), chainName: App.cfg.chain_name, rpcUrls: [App.cfg.rpc_url],
                   nativeCurrency: { name: App.cfg.currency, symbol: App.cfg.currency, decimals: 18 },
                   blockExplorerUrls: [App.cfg.explorer_url] }],
      });
    }
  };

  const setWallet = async () => {
    // Tạo provider SAU khi đã đúng mạng (ethers v6 báo lỗi nếu mạng đổi giữa chừng)
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    App.state = { provider, signer, address: await signer.getAddress() };
    const b = document.getElementById('btnWallet');
    b.textContent = '🟢 ' + App.short(App.state.address);
    b.title = App.state.address;
  };

  App.connect = async () => {
    await App.loadConfig();
    if (!App.hasWallet()) {
      App.toast('Bạn cần cài ví MetaMask (metamask.io) để dùng chức năng này.', 'error', 7000);
      throw new Error('NO_WALLET');
    }
    await window.ethereum.request({ method: 'eth_requestAccounts' });
    await App.ensureChain();
    await setWallet();
    return App.state;
  };

  // Đăng nhập bằng chữ ký — chỉ cần khi upload ảnh/mô tả lên IPFS
  App.ensureLogin = async () => {
    const st = App.state.address ? App.state : await App.connect();
    const me = await App.api('/api/auth/me/');
    if (me.address && App.sameAddr(me.address, st.address)) return;
    const n = await App.api('/api/auth/nonce/');
    const signature = await st.signer.signMessage(n.message);
    await App.api('/api/auth/verify/', { method: 'POST', json: { address: st.address, signature, nonce: n.nonce } });
  };

  // Gửi 1 giao dịch: hiển thị tiến trình + lỗi dễ hiểu. fn() trả về transaction response.
  App.tx = async (label, fn) => {
    const t = App.toast(`${label}: hãy xác nhận trong ví…`, 'info', 0);
    try {
      const tx = await fn();
      t.textContent = `${label}: đang chờ xác nhận trên blockchain…`;
      const receipt = await tx.wait();
      t.remove();
      App.toast(`${label}: thành công ✓`, 'ok');
      return receipt;
    } catch (e) {
      t.remove();
      App.toast(`${label}: ${App.errMsg(e)}`, 'error', 9000);
      throw e;
    }
  };

  App.electionContract = (address, signerOrProvider) => new ethers.Contract(address, window.ELECTION_ABI, signerOrProvider);
  App.factoryContract = (signerOrProvider) => new ethers.Contract(App.cfg.factory_address, window.FACTORY_ABI, signerOrProvider);

  // ---------------------------------------------------------------- realtime
  App.watch = (room, cb) => {
    let ws, closed = false;
    const open = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws/election/${room}/`);
      ws.onmessage = (e) => { try { cb(JSON.parse(e.data)); } catch (_) { /* bỏ qua tin lỗi */ } };
      ws.onclose = () => { if (!closed) setTimeout(open, 3000); };
    };
    open();
    return () => { closed = true; if (ws) ws.close(); };
  };

  // ---------------------------------------------------------------- khởi tạo trang
  App.init = async () => {
    const banner = document.getElementById('banner');
    try {
      await App.loadConfig();
    } catch (e) {
      banner.innerHTML = '<div class="notice error">Không tải được cấu hình máy chủ.</div>';
      throw e;
    }
    if (!App.cfg.factory_address) {
      banner.innerHTML = '<div class="notice error">⚠️ Nền tảng chưa được cấu hình: thiếu <code>FACTORY_ADDRESS</code> (chưa deploy ElectionFactory).</div>';
    }
    const btn = document.getElementById('btnWallet');
    btn.addEventListener('click', () => App.connect().catch((e) => { if (e.message !== 'NO_WALLET') App.toast(App.errMsg(e), 'error'); }));
    if (App.hasWallet()) {
      window.ethereum.on && window.ethereum.on('accountsChanged', () => location.reload());
      window.ethereum.on && window.ethereum.on('chainChanged', () => location.reload());
      // Nếu người dùng đã cấp quyền từ trước thì tự nhận ví, không bật popup
      try {
        const accts = await window.ethereum.request({ method: 'eth_accounts' });
        const chain = await window.ethereum.request({ method: 'eth_chainId' });
        if (accts.length && chain.toLowerCase() === hexChain()) await setWallet();
      } catch (_) { /* bỏ qua */ }
    }
    return App;
  };
})();
