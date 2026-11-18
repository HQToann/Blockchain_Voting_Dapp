(async () => {
  await App.init();
  const cfg = App.cfg, L = cfg.limits;
  const $ = App.$;
  const bytes = (s) => new TextEncoder().encode(s).length;
  const radio = (name) => document.querySelector(`input[name=${name}]:checked`)?.value;
  let rowSeq = 0;

  // 1. Cập nhật thông tin chủ sở hữu (Owner Address)
  function updateOwnerUI() {
    const addr = App.state.address;
    if ($('ownerAddress')) {
      $('ownerAddress').textContent = addr ? App.short(addr) : '0x... (Chưa kết nối ví)';
      $('ownerAddress').title = addr || '';
    }
    if ($('needWallet')) {
      $('needWallet').classList.toggle('hidden', !!addr);
    }
  }

  // Nút sao chép địa chỉ ví Owner
  if ($('btnCopyOwner')) {
    $('btnCopyOwner').addEventListener('click', () => {
      if (App.state.address) {
        navigator.clipboard.writeText(App.state.address);
        App.toast('Đã sao chép địa chỉ ví của bạn!', 'ok', 2000);
      } else {
        App.toast('Vui lòng kết nối ví trước.', 'warn');
      }
    });
  }

  if ($('btnConnectAlert')) {
    $('btnConnectAlert').addEventListener('click', () => App.connect().then(updateOwnerUI));
  }

  // 2. Mẫu HTML hàng ứng viên / lựa chọn (Material 3 Card)
  function candidateRowHtml(id, label, role, desc) {
    const idStr = String(id).padStart(3, '0');
    return `
      <!-- Left: Avatar Upload Box -->
      <div class="flex flex-col items-center gap-1.5 shrink-0 mx-auto md:mx-0">
        <label class="w-20 h-20 rounded-2xl overflow-hidden bg-slate-100 hover:bg-slate-200/70 border border-slate-200/90 shadow-2xs relative group cursor-pointer flex items-center justify-center text-slate-400 transition-colors">
          <input type="file" class="o-file sr-only" accept="image/png,image/jpeg,image/webp">
          <img class="thumb w-full h-full object-cover hidden" alt="Ảnh ứng viên">
          <span class="placeholder-icon material-symbols-outlined text-[32px] group-hover:scale-110 transition-transform">account_circle</span>
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
            <span class="material-symbols-outlined text-[20px]">photo_camera</span>
          </div>
        </label>
        <span class="font-label-tag text-label-tag text-slate-500 text-[10px] uppercase font-bold tracking-wider">
          Ảnh đại diện
        </span>
      </div>

      <!-- Right: Candidate Fields -->
      <div class="flex-1 w-full space-y-space-xs">
        <div class="flex items-center justify-between gap-space-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-sm flex-1">
            <div class="space-y-1">
              <label class="o-label-title font-headline-sm text-headline-sm text-slate-700 font-semibold text-xs">Tên ứng viên #${id}</label>
              <input type="text" class="o-label w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 px-3 py-2 rounded-xl font-headline-sm text-headline-sm text-slate-800 outline-none font-semibold text-sm transition-all shadow-2xs" placeholder="Nhập họ và tên ứng viên..." value="${App.esc(label)}">
            </div>
            <div class="space-y-1">
              <label class="o-role-title font-headline-sm text-headline-sm text-slate-700 font-semibold text-xs">Chức vụ / Đơn vị đề cử</label>
              <input type="text" class="o-role w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 px-3 py-2 rounded-xl font-body-md text-body-md text-slate-800 outline-none text-sm transition-all shadow-2xs" placeholder="VD: Lớp trưởng, Trưởng ban..." value="${App.esc(role)}">
            </div>
          </div>

          <div class="flex items-center gap-1.5 self-start pt-5">
            <span class="o-id-badge px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 font-label-code text-label-code font-bold text-xs border border-blue-200/60">
              ID: #${idStr}
            </span>
            <button type="button" class="o-del text-slate-400 hover:text-error transition-colors p-1 cursor-pointer" title="Xóa dòng này">
              <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>

        <div class="space-y-1 pt-1">
          <label class="font-headline-sm text-headline-sm text-slate-700 font-semibold text-xs">Mô tả</label>
          <input type="text" class="o-desc w-full bg-white border border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/15 px-3 py-2 rounded-xl font-body-sm text-body-sm text-slate-800 outline-none transition-all shadow-2xs" placeholder="Nêu các cam kết hoặc mục tiêu chính..." value="${App.esc(desc)}">
        </div>
      </div>
    `;
  }

  // 2.5. Các hàm hỗ trợ xử lý ảnh cho bản nháp & xem trước
  function dataURLtoFile(dataurl, filename = 'candidate.jpg') {
    if (!dataurl || typeof dataurl !== 'string' || !dataurl.startsWith('data:')) return null;
    try {
      const arr = dataurl.split(',');
      const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
      const bstr = atob(arr[1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      return new File([u8arr], filename, { type: mime });
    } catch (_) {
      return null;
    }
  }

  function compressImageForDraft(file) {
    return new Promise((resolve) => {
      if (!file) return resolve(null);
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const maxDim = 500;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
          else { w = Math.round((w * maxDim) / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  // 3. Thêm một hàng ứng viên / lựa chọn
  function addRow(label = '', role = '', desc = '', imageDataUrl = null, fileObj = null) {
    const id = ++rowSeq;
    const div = document.createElement('div');
    div.className = 'candidate-row rounded-2xl p-space-md bg-slate-50/80 border border-slate-200/90 hover:border-blue-300 transition-all flex flex-col md:flex-row items-start gap-space-md relative shadow-2xs';
    div.dataset.id = id;
    div.innerHTML = candidateRowHtml(id, label, role, desc);

    // Bắt sự kiện xóa
    div.querySelector('.o-del').addEventListener('click', () => {
      div.remove();
      renumberRows();
      refresh();
    });

    // Bắt sự kiện chọn ảnh đại diện & xem trước
    const fileInput = div.querySelector('.o-file');
    const imgThumb = div.querySelector('.thumb');
    const placeholderIcon = div.querySelector('.placeholder-icon');

    if (imageDataUrl) {
      imgThumb.src = imageDataUrl;
      imgThumb.classList.remove('hidden');
      placeholderIcon.classList.add('hidden');
    }
    if (fileObj) {
      div._file = fileObj;
      try {
        const dt = new DataTransfer();
        dt.items.add(fileObj);
        fileInput.files = dt.files;
      } catch (_) {}
    }

    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f && f.size > L.max_image_bytes) {
        App.toast(`Ảnh quá lớn (tối đa ${L.max_image_bytes / 1048576} MB).`, 'error');
        e.target.value = '';
        imgThumb.classList.add('hidden');
        placeholderIcon.classList.remove('hidden');
        div._file = null;
        return;
      }
      if (f) {
        div._file = f;
        imgThumb.src = URL.createObjectURL(f);
        imgThumb.classList.remove('hidden');
        placeholderIcon.classList.add('hidden');
      } else {
        div._file = null;
        imgThumb.classList.add('hidden');
        placeholderIcon.classList.remove('hidden');
      }
    });

    div.querySelector('.o-label').addEventListener('input', refresh);

    const container = $('optionsContainer') || $('options');
    if (container) container.appendChild(div);

    renumberRows();
    refresh();
    applyKind();
    return div;
  }

  function rows() {
    const container = $('optionsContainer') || $('options');
    return container ? [...container.querySelectorAll('.candidate-row')] : [];
  }

  function renumberRows() {
    rows().forEach((r, idx) => {
      const num = idx + 1;
      const idStr = String(num).padStart(3, '0');
      const badge = r.querySelector('.o-id-badge');
      if (badge) badge.textContent = `ID: #${idStr}`;
      const labelTitle = r.querySelector('.o-label-title');
      const isProposal = radio('kind') === '1';
      if (labelTitle) labelTitle.textContent = isProposal ? `Đáp án #${num}` : `Tên ứng viên #${num}`;
    });
  }

  function refresh() {
    const rws = rows();
    const n = rws.length;
    if ($('optCount')) $('optCount').textContent = `${n}/${L.max_options} lựa chọn`;

    const addTop = $('addOpt');
    const addBtm = $('addOptBottom');
    if (addTop) addTop.disabled = n >= L.max_options;
    if (addBtm) addBtm.disabled = n >= L.max_options;

    document.querySelectorAll('.o-del').forEach((b) => (b.disabled = n <= L.min_options));

    const mc = $('maxChoices');
    if (mc) {
      mc.max = n;
      if (+mc.value > n) mc.value = n;
      if (+mc.value < 1) mc.value = 1;
      const k = +mc.value || 1;
      if ($('maxHint')) {
        $('maxHint').textContent = k === 1
          ? `Mỗi cử tri chỉ chọn đúng 1 trong ${n} lựa chọn.`
          : `Được chọn từ 1 đến ${k} trong ${n} lựa chọn.`;
      }
    }
  }

  function applyKind() {
    const isProposal = radio('kind') === '1';

    if ($('nameLabel')) $('nameLabel').innerHTML = isProposal ? 'Câu hỏi / Vấn đề cần lấy ý kiến <span class="text-error">*</span>' : 'Tiêu đề cuộc bầu cử <span class="text-error">*</span>';
    if ($('name')) $('name').placeholder = isProposal ? 'VD: Có nên ứng dụng hệ thống biểu quyết Blockchain trong học kỳ mới?' : 'VD: Bầu ban cán sự đại diện nhiệm kỳ 2026 - Khoa Công Nghệ Thông Tin';
    if ($('optTitle')) $('optTitle').textContent = isProposal ? 'Danh sách các đáp án biểu quyết' : 'Danh sách ứng viên & Lựa chọn';

    rows().forEach((r, idx) => {
      const num = idx + 1;
      const labelTitle = r.querySelector('.o-label-title');
      const roleBox = r.querySelector('.o-role')?.closest('.space-y-1');
      const inputLabel = r.querySelector('.o-label');

      if (labelTitle) labelTitle.textContent = isProposal ? `Đáp án #${num}` : `Tên ứng viên #${num}`;
      if (inputLabel) inputLabel.placeholder = isProposal ? 'Ví dụ: Đồng ý / Phản đối...' : 'Nhập họ và tên ứng viên...';
      if (roleBox) roleBox.style.display = isProposal ? 'none' : 'block';
    });

    if ($('tplYesNo')) $('tplYesNo').classList.toggle('hidden', !isProposal);
  }

  // 3. Xử lý Whitelist (Danh sách địa chỉ cử tri)
  const parseAddresses = App.parseAddresses;

  function refreshWhitelistUI() {
    const val = $('wlInput') ? $('wlInput').value : '';
    const { valid, invalid } = parseAddresses(val);

    if ($('wlCounter')) {
      $('wlCounter').textContent = `(${valid.length} ví hợp lệ${invalid.length ? `, ${invalid.length} lỗi` : ''})`;
    }
    if ($('wlSummary')) {
      if (!valid.length && !invalid.length) {
        $('wlSummary').innerHTML = '<span class="material-symbols-outlined text-[15px]">verified</span> <span>Chưa nhập địa chỉ nào</span>';
        $('wlSummary').className = 'text-outline flex items-center gap-1 font-semibold';
      } else if (invalid.length) {
        $('wlSummary').innerHTML = `<span class="material-symbols-outlined text-[15px] text-error">error</span> <span class="text-error">${valid.length} ví hợp lệ, có ${invalid.length} địa chỉ sai định dạng</span>`;
      } else {
        $('wlSummary').innerHTML = `<span class="material-symbols-outlined text-[15px] text-tertiary">verified</span> <span class="text-tertiary">Đã xác minh ${valid.length} địa chỉ hợp lệ (0 trùng lặp)</span>`;
      }
    }
  }

  if ($('wlInput')) $('wlInput').addEventListener('input', refreshWhitelistUI);

  // Đọc file CSV
  if ($('wlCsvFile')) {
    $('wlCsvFile').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target.result;
        const current = $('wlInput').value.trim();
        $('wlInput').value = current ? current + '\n' + text : text;
        refreshWhitelistUI();
        App.toast('Đã nạp danh sách địa chỉ từ file!', 'ok');
      };
      reader.readAsText(file);
    });
  }

  // Kiểm tra & chuẩn hoá Checksum EIP-55
  if ($('btnWlChecksum')) {
    $('btnWlChecksum').addEventListener('click', () => {
      const { valid, invalid } = parseAddresses($('wlInput').value);
      if (!valid.length) return App.toast('Chưa có địa chỉ hợp lệ nào để chuẩn hoá.', 'warn');
      $('wlInput').value = valid.join('\n');
      refreshWhitelistUI();
      App.toast(`Đã chuẩn hoá ${valid.length} địa chỉ theo tiêu chuẩn EIP-55!`, 'ok');
    });
  }

  // Bật/tắt công tắc Whitelist
  if ($('whitelist-toggle')) {
    $('whitelist-toggle').addEventListener('change', (e) => {
      if ($('whitelist-box')) $('whitelist-box').classList.toggle('hidden', !e.target.checked);
    });
  }

  // 5. Bộ đếm ký tự thời gian thực
  if ($('name') && $('title-counter')) {
    $('name').addEventListener('input', () => {
      $('title-counter').textContent = `${$('name').value.length} / 90 ký tự`;
    });
  }
  if ($('desc') && $('desc-counter')) {
    $('desc').addEventListener('input', () => {
      $('desc-counter').textContent = `${$('desc').value.length} / 500`;
    });
  }

  // 6. Thu thập dữ liệu Form
  function collect() {
    const isPrivate = $('whitelist-toggle') ? $('whitelist-toggle').checked : false;
    const { valid: whitelist } = parseAddresses($('wlInput') ? $('wlInput').value : '');

    return {
      kind: +radio('kind') || 0,
      name: ($('name') ? $('name').value.trim() : ''),
      description: $('desc') ? $('desc').value.trim() : '',
      isPrivate,
      whitelist,
      whitelistRaw: $('wlInput') ? $('wlInput').value : '',
      maxChoices: $('maxChoices') ? +$('maxChoices').value : 1,
      startMode: radio('startMode') || 'now',
      startAt: $('startAt') ? $('startAt').value : '',
      endMode: radio('endMode') || 'none',
      endAt: $('endAt') ? $('endAt').value : '',
      options: rows().map((r) => {
        const thumb = r.querySelector('.thumb');
        const hasImg = thumb && !thumb.classList.contains('hidden') && thumb.src;
        return {
          label: r.querySelector('.o-label').value.trim(),
          role: r.querySelector('.o-role') ? r.querySelector('.o-role').value.trim() : '',
          description: r.querySelector('.o-desc').value.trim(),
          file: r.querySelector('.o-file').files[0] || r._file || null,
          imageDataUrl: hasImg ? thumb.src : null,
        };
      }),
    };
  }

  // 7. Xác thực nghiệp vụ
  function validate(f) {
    const errs = [];
    if (!f.name) errs.push('Hãy nhập tiêu đề cuộc bầu cử hoặc câu hỏi lấy ý kiến.');
    if (bytes(f.name) > L.max_name_bytes) errs.push(`Tiêu đề quá dài (tối đa ${L.max_name_bytes} byte).`);
    if (f.options.length < L.min_options) errs.push(`Cần ít nhất ${L.min_options} lựa chọn.`);

    const seen = new Set();
    f.options.forEach((o, i) => {
      if (!o.label) errs.push(`Lựa chọn #${i + 1} đang để trống tên.`);
      else if (bytes(o.label) > L.max_label_bytes) errs.push(`Lựa chọn #${i + 1} quá dài (tối đa ${L.max_label_bytes} byte).`);
      const key = o.label.toLowerCase();
      if (o.label && seen.has(key)) errs.push(`Lựa chọn "${o.label}" bị trùng lặp.`);
      seen.add(key);
    });

    if (!(f.maxChoices >= 1 && f.maxChoices <= f.options.length)) errs.push('Số lựa chọn tối đa không hợp lệ.');

    const now = Date.now() / 1000;
    let start = 0, end = 0;

    if (f.startMode === 'at' && $('startAt')) {
      start = App.toUnix($('startAt').value);
      if (!start) errs.push('Hãy chọn thời điểm bắt đầu.');
      else if (start < now - 60) errs.push('Thời điểm bắt đầu đang ở quá khứ.');
    }

    if (f.endMode === 'at' && $('endAt')) {
      end = App.toUnix($('endAt').value);
      if (!end) errs.push('Hãy chọn thời điểm kết thúc.');
      else if (end <= Math.max(start, now + 60)) errs.push('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    }

    return { errs, start, end };
  }

  // 8. Hộp thoại tiến trình Modal (Material 3)
  const steps = [];
  function showModal() {
    let m = $('progressModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'progressModal';
      m.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4';
      m.innerHTML = `
        <div class="bg-surface-container-lowest rounded-3xl p-space-xl w-full max-w-md shadow-2xl border border-surface-container-high space-y-space-md">
          <div class="text-center space-y-1">
            <div class="w-12 h-12 rounded-2xl bg-primary-container text-on-primary flex items-center justify-center mx-auto shadow-md">
              <span class="material-symbols-outlined text-[24px]">token</span>
            </div>
            <h3 class="font-headline-md text-headline-md font-bold text-on-surface">Khởi tạo Hòm phiếu</h3>
            <p class="font-body-sm text-body-sm text-on-surface-variant">Vui lòng không đóng trình duyệt trong quá trình này</p>
          </div>
          <div id="modalSteps" class="space-y-3 pt-2"></div>
        </div>`;
      document.body.appendChild(m);
    }
  }

  function hideModal() {
    const m = $('progressModal');
    if (m) m.remove();
  }

  function step(text) {
    steps.push(text);
    showModal();
    const c = $('modalSteps');
    if (!c) return;

    c.innerHTML = steps.map((s, i) => {
      const isLast = i === steps.length - 1;
      const icon = isLast
        ? '<span class="material-symbols-outlined text-[20px] text-primary animate-spin">progress_activity</span>'
        : '<span class="material-symbols-outlined text-[20px] text-tertiary">check_circle</span>';
      const textClass = isLast ? 'font-bold text-on-surface' : 'font-medium text-on-surface-variant';

      return `
        <div class="flex items-center gap-3 text-sm">
          <div class="w-6 flex items-center justify-center shrink-0">${icon}</div>
          <span class="${textClass} flex-1 leading-snug">${App.esc(s)}</span>
        </div>`;
    }).join('');
  }

  // 9. Thực thi gửi giao dịch & Triển khai Contract
  async function submit() {
    const f = collect();
    const { errs, start, end } = validate(f);

    if ($('errors')) {
      $('errors').classList.toggle('hidden', !errs.length);
      $('errors').innerHTML = errs.map((e) => `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-error shrink-0">error</span><span>${App.esc(e)}</span></div>`).join('');
    }

    if (errs.length) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (!cfg.factory_address) return App.toast('Nền tảng chưa cấu hình Factory Address.', 'error');

    const submitBtn = $('submit');
    if (submitBtn) submitBtn.disabled = true;
    steps.length = 0;

    try {
      step('Kết nối ví MetaMask…');
      await App.connect();
      updateOwnerUI();

      const needMeta = f.description || f.options.some((o) => o.description || o.role || o.file);
      let metadataURI = '';

      if (needMeta) {
        if (!cfg.ipfs_enabled) throw new Error('Máy chủ chưa bật IPFS: hãy bỏ mô tả/ảnh hoặc liên hệ quản trị.');
        step('Xác nhận chủ ví (ký tin nhắn SIWE, hoàn toàn miễn phí gas)…');
        await App.ensureLogin();

        const metaOptions = [];
        for (let i = 0; i < f.options.length; i++) {
          const o = f.options[i];
          let image = '';
          if (o.file) {
            step(`Tải ảnh đại diện ${i + 1}/${f.options.length} lên Pinata IPFS…`);
            const form = new FormData(); form.append('image', o.file);
            image = (await App.api('/api/ipfs/image/', { method: 'POST', form })).cid;
          }
          // Kết hợp chức vụ và cương lĩnh vào mô tả IPFS
          const fullDesc = o.role ? (o.description ? `${o.role} • ${o.description}` : o.role) : o.description;
          metaOptions.push({ label: o.label, description: fullDesc, image });
        }

        step('Đóng gói & ghim Metadata lên IPFS…');
        metadataURI = (await App.api('/api/ipfs/metadata/', {
          method: 'POST',
          json: { description: f.description, options: metaOptions }
        })).cid;
      }

      step('Gửi giao dịch tạo hòm phiếu — Vui lòng ký trên ví MetaMask…');
      const factory = App.factoryContract(App.state.signer);
      const params = {
        name: f.name,
        metadataURI,
        kind: f.kind,
        isPrivate: f.isPrivate,
        maxChoices: f.maxChoices,
        startTime: start,
        endTime: end,
        options: f.options.map((o) => o.label)
      };

      const tx = await factory.createElection(params);

      step('Đang đợi mạng Sepolia xác nhận khối (khoảng 12s)…');
      const receipt = await tx.wait();

      const ev = receipt.logs
        .map((l) => { try { return factory.interface.parseLog(l); } catch (_) { return null; } })
        .find((e) => e && e.name === 'ElectionCreated');

      if (!ev) throw new Error('Thành công nhưng không đọc được địa chỉ hòm phiếu. Vui lòng xem ở mục "Của tôi".');

      const electionAddr = ev.args.election;

      // Nếu là hòm phiếu riêng tư và có sẵn danh sách ví, tự động nạp Whitelist luôn
      if (f.isPrivate && f.whitelist.length > 0) {
        step(`Đang thêm ${f.whitelist.length} ví vào danh sách Whitelist…`);
        try {
          const electionContract = App.electionContract(electionAddr, App.state.signer);
          const WL_CHUNK = 100;
          const n = Math.ceil(f.whitelist.length / WL_CHUNK);
          for (let i = 0; i < n; i++) {
            const chunk = f.whitelist.slice(i * WL_CHUNK, (i + 1) * WL_CHUNK);
            step(`Nạp cử tri vào Whitelist (${i + 1}/${n})…`);
            const wtx = await electionContract.addToWhitelist(chunk);
            await wtx.wait();
          }
        } catch (wErr) {
          console.warn('Lỗi thêm whitelist tự động:', wErr);
          App.toast('Hòm phiếu đã tạo! Bạn có thể thêm tiếp Whitelist ở trang quản lý.', 'warn', 6000);
        }
      }

      step('Khởi tạo thành công! Đang chuyển hướng…');
      if (activeDraftId) {
        deleteDraft(activeDraftId, true);
      }
      setTimeout(() => {
        location.href = `/election/${electionAddr}/?new=1`;
      }, 1500);

    } catch (e) {
      hideModal();
      if (e.message !== 'NO_WALLET') {
        if ($('errors')) {
          $('errors').classList.remove('hidden');
          $('errors').innerHTML = `<div class="flex items-center gap-2"><span class="material-symbols-outlined text-[16px] text-error shrink-0">error</span><span>${App.esc(App.errMsg(e))}</span></div>`;
        }
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // =========================================================================
  // 9.5. HỆ THỐNG QUẢN LÝ BẢN NHÁP (DRAFTS SYSTEM)
  // =========================================================================
  const DRAFTS_KEY = 'votechain_election_drafts';
  let activeDraftId = null;

  function getDrafts() {
    try {
      return JSON.parse(localStorage.getItem(DRAFTS_KEY) || '[]');
    } catch (_) {
      return [];
    }
  }

  function saveDraftsToStorage(drafts) {
    try {
      localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
    } catch (err) {
      console.warn('Không thể lưu vào localStorage:', err);
      App.toast('Bộ nhớ trình duyệt đầy, vui lòng xóa bớt bản nháp cũ.', 'error');
    }
  }

  function updateDraftsUI() {
    const drafts = getDrafts();
    const count = drafts.length;

    if ($('draftBanner')) $('draftBanner').classList.toggle('hidden', count === 0);
    if ($('draftCountBadge')) $('draftCountBadge').textContent = count;
    if ($('draftCountHero')) $('draftCountHero').textContent = count;

    if ($('btnQuickDrafts')) $('btnQuickDrafts').classList.toggle('hidden', count === 0);
    if ($('quickDraftsLabel')) $('quickDraftsLabel').textContent = `Nháp (${count})`;

    if ($('btnViewDraftsBottom')) $('btnViewDraftsBottom').classList.toggle('hidden', count === 0);
    if ($('bottomDraftsLabel')) $('bottomDraftsLabel').textContent = `Xem bản nháp (${count})`;
  }

  async function saveCurrentDraft(silent = false) {
    const f = collect();
    const hasAnyContent = f.name || f.description || f.options.some((o) => o.label || o.role || o.description || o.file || o.imageDataUrl);
    
    if (!hasAnyContent) {
      App.toast('Chưa có nội dung nào trên form để lưu bản nháp.', 'warn');
      return null;
    }

    // Nén ảnh để lưu trữ nhẹ nhàng trong localStorage
    const optsForDraft = [];
    for (let i = 0; i < f.options.length; i++) {
      const o = f.options[i];
      let compressedDataUrl = o.imageDataUrl;
      if (o.file) {
        compressedDataUrl = await compressImageForDraft(o.file);
      }
      optsForDraft.push({
        label: o.label,
        role: o.role,
        description: o.description,
        imageDataUrl: compressedDataUrl,
      });
    }

    const drafts = getDrafts();
    const nowIso = new Date().toISOString();
    const draftId = activeDraftId || `draft_${Date.now()}`;
    activeDraftId = draftId;

    const newDraft = {
      id: draftId,
      updatedAt: nowIso,
      name: f.name || '(Bản nháp chưa đặt tên)',
      description: f.description,
      kind: f.kind,
      maxChoices: f.maxChoices,
      startMode: f.startMode,
      startAt: f.startAt,
      endMode: f.endMode,
      endAt: f.endAt,
      isPrivate: f.isPrivate,
      whitelistRaw: f.whitelistRaw,
      options: optsForDraft,
    };

    const existingIdx = drafts.findIndex((d) => d.id === draftId);
    if (existingIdx >= 0) {
      drafts[existingIdx] = newDraft;
    } else {
      drafts.unshift(newDraft);
    }

    saveDraftsToStorage(drafts);
    updateDraftsUI();

    if (!silent) {
      App.toast(`Đã lưu bản nháp: "${newDraft.name}"!`, 'ok');
    }
    return newDraft;
  }

  function deleteDraft(draftId, silent = false) {
    let drafts = getDrafts();
    drafts = drafts.filter((d) => d.id !== draftId);
    saveDraftsToStorage(drafts);

    if (activeDraftId === draftId) {
      activeDraftId = null;
    }

    updateDraftsUI();
    renderDraftsList();

    if (!silent) {
      App.toast('Đã xóa bản nháp!', 'ok');
    }
  }

  function clearAllDrafts() {
    if (!confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ các bản nháp hòm phiếu đã lưu trên trình duyệt này?')) return;
    localStorage.removeItem(DRAFTS_KEY);
    activeDraftId = null;
    updateDraftsUI();
    renderDraftsList();
    App.toast('Đã xóa tất cả bản nháp.', 'ok');
  }

  function loadDraftToForm(draft) {
    if (!draft) return;

    activeDraftId = draft.id;

    if ($('name')) {
      $('name').value = draft.name === '(Bản nháp chưa đặt tên)' ? '' : (draft.name || '');
      if ($('title-counter')) $('title-counter').textContent = `${$('name').value.length} / 90 ký tự`;
    }
    if ($('desc')) {
      $('desc').value = draft.description || '';
      if ($('desc-counter')) $('desc-counter').textContent = `${$('desc').value.length} / 500`;
    }

    const kindRadio = document.querySelector(`input[name=kind][value="${draft.kind || 0}"]`);
    if (kindRadio) {
      kindRadio.checked = true;
      applyKind();
    }

    if ($('maxChoices')) $('maxChoices').value = draft.maxChoices || 1;

    const startRadio = document.querySelector(`input[name=startMode][value="${draft.startMode || 'now'}"]`);
    if (startRadio) {
      startRadio.checked = true;
      if ($('startAtBox')) $('startAtBox').classList.toggle('hidden', draft.startMode !== 'at');
    }
    if ($('startAt') && draft.startAt) $('startAt').value = draft.startAt;

    const endRadio = document.querySelector(`input[name=endMode][value="${draft.endMode || 'none'}"]`);
    if (endRadio) {
      endRadio.checked = true;
      if ($('endAtBox')) $('endAtBox').classList.toggle('hidden', draft.endMode !== 'at');
    }
    if ($('endAt') && draft.endAt) $('endAt').value = draft.endAt;

    if ($('whitelist-toggle')) {
      $('whitelist-toggle').checked = !!draft.isPrivate;
      if ($('whitelist-box')) $('whitelist-box').classList.toggle('hidden', !draft.isPrivate);
    }
    if ($('wlInput')) {
      $('wlInput').value = draft.whitelistRaw || '';
      refreshWhitelistUI();
    }

    // Nạp lại danh sách options
    const container = $('optionsContainer') || $('options');
    if (container) {
      container.innerHTML = '';
      rowSeq = 0;
      if (draft.options && draft.options.length) {
        draft.options.forEach((o, idx) => {
          const fileObj = o.imageDataUrl ? dataURLtoFile(o.imageDataUrl, `candidate_${idx + 1}.jpg`) : null;
          addRow(o.label || '', o.role || '', o.description || '', o.imageDataUrl || null, fileObj);
        });
      } else {
        addRow('', '', '');
        addRow('', '', '');
      }
    }

    hideDraftsModal();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    App.toast(`Đã nạp bản nháp: "${draft.name}"!`, 'ok');
  }

  function showDraftsModal() {
    renderDraftsList();
    if ($('draftsModal')) $('draftsModal').classList.remove('hidden');
  }

  function hideDraftsModal() {
    if ($('draftsModal')) $('draftsModal').classList.add('hidden');
  }

  function renderDraftsList() {
    const container = $('draftsListContainer');
    if (!container) return;
    const drafts = getDrafts();

    if (!drafts.length) {
      container.innerHTML = `
        <div class="p-12 text-center flex flex-col items-center justify-center gap-3 text-on-surface-variant">
          <div class="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-outline">
            <span class="material-symbols-outlined text-[32px]">drafts</span>
          </div>
          <div class="space-y-1">
            <h4 class="font-headline-sm font-bold text-on-surface">Chưa có bản nháp nào được lưu</h4>
            <p class="font-body-sm text-xs max-w-xs mx-auto">
              Khi bạn điền thông tin và bấm "Lưu bản nháp", dữ liệu sẽ được lưu an toàn tại đây để tiếp tục chỉnh sửa bất kỳ lúc nào.
            </p>
          </div>
        </div>
      `;
      if ($('btnClearAllDrafts')) $('btnClearAllDrafts').classList.add('hidden');
      return;
    }

    if ($('btnClearAllDrafts')) $('btnClearAllDrafts').classList.remove('hidden');

    container.innerHTML = drafts.map((d) => {
      const isProp = d.kind === 1;
      const count = d.options ? d.options.length : 0;
      const timeStr = App.fmtDate(new Date(d.updatedAt));
      const isActive = activeDraftId === d.id;

      return `
        <div class="p-space-md rounded-2xl bg-surface-container-lowest border ${isActive ? 'border-primary ring-1 ring-primary/30' : 'border-surface-container-high'} hover:border-primary/50 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-space-md shadow-xs">
          <div class="space-y-1.5 flex-1 min-w-0">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-full font-label-tag text-[10px] font-bold uppercase ${isProp ? 'bg-secondary-fixed text-on-secondary-fixed' : 'bg-primary-fixed text-on-primary-fixed'}">
                ${isProp ? 'Biểu quyết' : 'Bầu cử'}
              </span>
              <span class="px-2.5 py-0.5 rounded-full font-label-tag text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">
                ${d.isPrivate ? 'Riêng tư (Whitelist)' : 'Công khai'}
              </span>
              <span class="px-2.5 py-0.5 rounded-full font-label-tag text-[10px] font-semibold bg-surface-container-high text-on-surface-variant">
                ${count} lựa chọn
              </span>
              ${isActive ? '<span class="px-2 py-0.5 rounded-full font-label-tag text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">Đang mở trên form</span>' : ''}
            </div>

            <h4 class="font-headline-sm font-bold text-on-surface text-base truncate">
              ${App.esc(d.name)}
            </h4>

            <p class="font-body-sm text-xs text-on-surface-variant flex items-center gap-1.5">
              <span class="material-symbols-outlined text-[14px]">update</span>
              Cập nhật gần nhất: <span class="font-label-code text-on-surface font-medium">${timeStr}</span>
            </p>
          </div>

          <div class="flex items-center gap-2 shrink-0 self-end sm:self-center">
            <button type="button" class="btn-draft-edit px-3 py-1.5 rounded-xl bg-primary-container text-on-primary font-headline-sm text-xs font-bold hover:bg-primary transition-all flex items-center gap-1 shadow-xs cursor-pointer" data-id="${d.id}" title="Nạp vào form để sửa">
              <span class="material-symbols-outlined text-[15px]">edit</span>
              Mở sửa
            </button>
            <button type="button" class="btn-draft-prev px-3 py-1.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface font-headline-sm text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer border border-surface-container-high" data-id="${d.id}" title="Xem trước bản nháp này">
              <span class="material-symbols-outlined text-[15px] text-secondary">visibility</span>
              Xem trước
            </button>
            <button type="button" class="btn-draft-del px-2.5 py-1.5 rounded-xl hover:bg-red-50 text-error font-headline-sm text-xs font-semibold transition-all flex items-center gap-1 cursor-pointer" data-id="${d.id}" title="Xóa bản nháp này">
              <span class="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Bắt sự kiện các nút trên từng bản nháp
    container.querySelectorAll('.btn-draft-edit').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const d = getDrafts().find((x) => x.id === id);
        if (d) loadDraftToForm(d);
      });
    });

    container.querySelectorAll('.btn-draft-prev').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        const d = getDrafts().find((x) => x.id === id);
        if (d) {
          hideDraftsModal();
          showPreviewModal(d);
        }
      });
    });

    container.querySelectorAll('.btn-draft-del').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.id;
        if (confirm('Bạn có chắc chắn muốn xóa bản nháp này?')) {
          deleteDraft(id);
        }
      });
    });
  }

  // =========================================================================
  // 9.6. HỆ THỐNG XEM TRƯỚC HÒM PHIẾU (PREVIEW SYSTEM)
  // =========================================================================
  function showPreviewModal(data) {
    const body = $('previewBody');
    if (body) {
      body.innerHTML = renderPreview(data);
      setupMockSelection(data.maxChoices || 1);
    }
    if ($('previewModal')) $('previewModal').classList.remove('hidden');
  }

  function hidePreviewModal() {
    if ($('previewModal')) $('previewModal').classList.add('hidden');
  }

  function renderPreview(data) {
    const isProposal = data.kind === 1;
    const now = Date.now() / 1000;
    
    // Tính trạng thái dự kiến
    let startTimeText = 'Ngay sau khi giao dịch tạo hòm phiếu hoàn tất';
    let endTimeText = 'Không giới hạn thời gian (Đóng thủ công bởi chủ hòm phiếu)';
    let isLiveNow = true;

    if (data.startMode === 'at' && data.startAt) {
      const startUnix = App.toUnix(data.startAt);
      if (startUnix) {
        startTimeText = App.fmtDate(new Date(startUnix * 1000));
        if (startUnix > now) isLiveNow = false;
      }
    }
    if (data.endMode === 'at' && data.endAt) {
      const endUnix = App.toUnix(data.endAt);
      if (endUnix) {
        endTimeText = App.fmtDate(new Date(endUnix * 1000));
      }
    }

    const addr = App.state.address || '0xVí của bạn (Chưa kết nối)';
    const whitelistArr = Array.isArray(data.whitelist) 
      ? data.whitelist 
      : (data.whitelistRaw ? parseAddresses(data.whitelistRaw).valid : []);
    const wlCount = whitelistArr.length;

    let optionsHtml = '';
    if (data.options && data.options.length) {
      optionsHtml = data.options.map((o, idx) => {
        const idNum = idx + 1;
        const idStr = String(idNum).padStart(3, '0');
        const hasImg = !!o.imageDataUrl;
        
        return `
          <div class="p-space-md sm:p-space-lg rounded-2xl bg-surface-container-lowest border border-surface-container-high/80 shadow-xs hover:border-primary/40 transition-all flex flex-col md:flex-row items-start gap-space-md preview-option-item" data-id="${idNum}">
            <div class="flex items-center gap-space-md w-full md:w-auto">
              <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-surface-container-high border border-surface-container-high flex items-center justify-center shrink-0 shadow-xs">
                ${hasImg 
                  ? `<img src="${o.imageDataUrl}" alt="${App.esc(o.label)}" class="w-full h-full object-cover">`
                  : `<span class="material-symbols-outlined text-[36px] text-outline">${isProposal ? 'ballot' : 'person'}</span>`
                }
              </div>
              <div class="flex md:hidden flex-col">
                <span class="font-headline-sm font-bold text-on-surface text-base">${App.esc(o.label) || `Lựa chọn #${idNum}`}</span>
                ${o.role ? `<span class="text-xs font-semibold text-secondary">${App.esc(o.role)}</span>` : ''}
              </div>
            </div>

            <div class="flex-1 w-full space-y-2">
              <div class="hidden md:flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h4 class="font-headline-md text-on-surface font-bold text-base sm:text-lg">
                    ${App.esc(o.label) || `Lựa chọn #${idNum}`}
                  </h4>
                  ${o.role ? `
                    <span class="px-2.5 py-0.5 rounded-lg bg-secondary-fixed/60 text-on-secondary-fixed font-headline-sm text-xs font-bold">
                      ${App.esc(o.role)}
                    </span>` : ''}
                </div>
                <span class="font-label-code text-xs px-2 py-0.5 rounded-md bg-surface-container-low text-primary font-bold">
                  ID #${idStr}
                </span>
              </div>

              ${o.description ? `
                <div class="p-3 rounded-xl bg-surface-container-low/60 border border-surface-container-high/40 text-on-surface-variant font-body-sm text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                  <span class="font-bold text-on-surface block mb-0.5">${isProposal ? 'Nội dung chi tiết:' : 'Mô tả:'}</span>
                  ${App.esc(o.description)}
                </div>
              ` : ''}

              <!-- Mock Vote Selection Button -->
              <div class="pt-2 flex items-center justify-between gap-2 flex-wrap">
                <button type="button" class="btn-mock-pick px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-surface-container-high" data-id="${idNum}">
                  <span class="material-symbols-outlined text-[18px] text-outline pick-icon">check_box_outline_blank</span>
                  <span class="pick-text">Chọn thử nghiệm</span>
                </button>
                <span class="text-outline font-label-code text-[11px]">
                  Số phiếu ban đầu: 0 phiếu (0%)
                </span>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else {
      optionsHtml = `
        <div class="p-8 text-center bg-surface-container-low rounded-2xl text-on-surface-variant font-medium">
          Chưa có lựa chọn nào được thêm vào danh sách.
        </div>
      `;
    }

    return `
      <!-- Card Hero Preview -->
      <div class="rounded-3xl bg-surface-container-lowest p-space-lg sm:p-space-xl border border-surface-container-high/70 shadow-sm space-y-space-md">
        
        <!-- Badges Bar -->
        <div class="flex flex-wrap items-center gap-2">
          ${isLiveNow ? `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-on-tertiary-container text-tertiary font-label-tag text-label-tag font-bold tracking-wide uppercase shadow-2xs">
              <span class="w-2 h-2 rounded-full bg-tertiary animate-ping"></span>
              BỎ PHIẾU ĐANG DIỄN RA
            </span>
          ` : `
            <span class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-label-tag text-label-tag font-bold tracking-wide uppercase">
              <span class="material-symbols-outlined text-[14px]">schedule</span>
              SẮP DIỄN RA
            </span>
          `}

          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low text-secondary font-label-tag text-label-tag font-semibold">
            <span class="material-symbols-outlined text-[14px]">${isProposal ? 'poll' : 'badge'}</span>
            ${isProposal ? 'Lấy ý kiến biểu quyết' : 'Bầu chọn ứng viên'}
          </span>

          <span class="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-container-low ${data.isPrivate ? 'text-purple-700' : 'text-primary'} font-label-tag text-label-tag font-semibold">
            <span class="material-symbols-outlined text-[14px]">${data.isPrivate ? 'lock' : 'public'}</span>
            ${data.isPrivate ? `Riêng tư (Whitelist: ${wlCount} ví)` : 'Công khai (Mọi ví Web3)'}
          </span>
        </div>

        <!-- Title & Metadata -->
        <div class="space-y-1">
          <h2 class="font-headline-xl text-headline-xl text-on-surface font-extrabold tracking-tight">
            ${App.esc(data.name) || '<span class="text-outline italic">Chưa đặt tiêu đề hòm phiếu</span>'}
          </h2>
          <div class="flex flex-wrap items-center gap-x-4 gap-y-1 font-body-sm text-xs sm:text-sm text-on-surface-variant pt-1">
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-outline">account_circle</span>
              Chủ tạo: <strong class="text-on-surface font-label-code">${App.short(addr)}</strong>
            </span>
            <span>•</span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-tertiary">toll</span>
              Mạng: <strong>Ethereum Sepolia</strong>
            </span>
            <span>•</span>
            <span class="flex items-center gap-1">
              <span class="material-symbols-outlined text-[16px] text-secondary">verified</span>
              Chuẩn: <strong>ERC-1202</strong>
            </span>
          </div>
        </div>

        <!-- Description -->
        ${data.description ? `
          <div class="p-space-md rounded-2xl bg-surface-container-low/60 border border-surface-container-high/40">
            <p class="font-body-md text-on-surface-variant text-sm leading-relaxed whitespace-pre-wrap">${App.esc(data.description)}</p>
          </div>
        ` : ''}

        <!-- Rules & Metrics Box -->
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-space-sm pt-1">
          <div class="p-space-md rounded-2xl bg-surface-container-low border border-surface-container-high/60 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-primary-fixed text-primary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">how_to_vote</span>
            </div>
            <div>
              <span class="text-xs text-on-surface-variant block">Quy tắc lựa chọn</span>
              <strong class="font-headline-sm text-sm text-on-surface">Tối đa ${data.maxChoices} lựa chọn</strong>
            </div>
          </div>

          <div class="p-space-md rounded-2xl bg-surface-container-low border border-surface-container-high/60 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-secondary-fixed text-secondary flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">groups</span>
            </div>
            <div>
              <span class="text-xs text-on-surface-variant block">Quyền tham gia</span>
              <strong class="font-headline-sm text-sm text-on-surface">${data.isPrivate ? `${wlCount} ví cử tri` : 'Mọi ví Web3'}</strong>
            </div>
          </div>

          <div class="p-space-md rounded-2xl bg-surface-container-low border border-surface-container-high/60 flex items-center gap-3">
            <div class="w-10 h-10 rounded-xl bg-tertiary-fixed text-on-tertiary-fixed-variant flex items-center justify-center shrink-0">
              <span class="material-symbols-outlined text-[20px]">lock_clock</span>
            </div>
            <div>
              <span class="text-xs text-on-surface-variant block">Thời gian diễn ra</span>
              <strong class="font-headline-sm text-xs text-on-surface line-clamp-1" title="${endTimeText}">${endTimeText}</strong>
            </div>
          </div>
        </div>

      </div>

      <!-- Candidate / Options List -->
      <div class="space-y-space-md">
        <div class="flex items-center justify-between">
          <h3 class="font-headline-lg text-headline-lg font-bold text-on-surface flex items-center gap-2">
            <span class="material-symbols-outlined text-primary text-[24px]">ballot</span>
            ${isProposal ? 'Danh sách đáp án biểu quyết' : 'Danh sách ứng viên & lựa chọn'}
          </h3>
          <span class="font-body-sm text-xs text-on-surface-variant">
            Bạn có thể bấm vào các nút để thử nghiệm chọn
          </span>
        </div>

        <div class="space-y-space-md" id="previewOptionsList">
          ${optionsHtml}
        </div>
      </div>

      <!-- Technical Protocol Notice -->
      <div class="p-space-md rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 flex items-start gap-3 text-xs leading-relaxed">
        <span class="material-symbols-outlined text-primary text-[22px] shrink-0 mt-0.5">info</span>
        <div>
          <strong class="font-bold block mb-0.5">Chế độ xem trước tương tác (Pre-flight Preview)</strong>
          Dữ liệu này chỉ đang hiển thị thử nghiệm trên trình duyệt của bạn. Khi bấm <b>"Xác nhận & Đẩy lên Blockchain"</b>, hệ thống sẽ thực hiện đăng nhập ví, tải ảnh lên IPFS và gửi giao dịch tạo hợp đồng thông minh đến mạng Sepolia Testnet.
        </div>
      </div>
    `;
  }

  function setupMockSelection(maxChoices) {
    const selected = new Set();
    document.querySelectorAll('.btn-mock-pick').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = +btn.dataset.id;
        if (selected.has(id)) {
          selected.delete(id);
        } else {
          if (maxChoices === 1) {
            selected.clear();
          } else if (selected.size >= maxChoices) {
            App.toast(`Chỉ được chọn tối đa ${maxChoices} lựa chọn!`, 'warn');
            return;
          }
          selected.add(id);
        }

        document.querySelectorAll('.btn-mock-pick').forEach((b) => {
          const bId = +b.dataset.id;
          const isSel = selected.has(bId);
          const icon = b.querySelector('.pick-icon');
          const text = b.querySelector('.pick-text');
          if (isSel) {
            b.className = 'btn-mock-pick px-4 py-2 rounded-xl bg-primary-container text-on-primary font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-xs';
            if (icon) {
              icon.textContent = maxChoices === 1 ? 'radio_button_checked' : 'check_box';
              icon.className = 'material-symbols-outlined text-[18px] pick-icon text-on-primary';
            }
            if (text) text.textContent = 'Đã chọn';
          } else {
            b.className = 'btn-mock-pick px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container-high text-on-surface font-headline-sm text-xs sm:text-sm font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-surface-container-high';
            if (icon) {
              icon.textContent = maxChoices === 1 ? 'radio_button_unchecked' : 'check_box_outline_blank';
              icon.className = 'material-symbols-outlined text-[18px] pick-icon text-outline';
            }
            if (text) text.textContent = 'Chọn thử nghiệm';
          }
        });
      });
    });
  }

  // 10. Khởi tạo các sự kiện & giao diện ban đầu
  document.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', applyKind));

  document.querySelectorAll('input[name=startMode]').forEach((r) => r.addEventListener('change', () => {
    if ($('startAtBox')) $('startAtBox').classList.toggle('hidden', radio('startMode') !== 'at');
  }));

  document.querySelectorAll('input[name=endMode]').forEach((r) => r.addEventListener('change', () => {
    if ($('endAtBox')) $('endAtBox').classList.toggle('hidden', radio('endMode') !== 'at');
  }));

  if ($('maxChoices')) $('maxChoices').addEventListener('input', refresh);

  if ($('addOpt')) $('addOpt').addEventListener('click', () => addRow());
  if ($('addOptBottom')) $('addOptBottom').addEventListener('click', () => addRow());

  if ($('tplYesNo')) {
    $('tplYesNo').addEventListener('click', () => {
      const container = $('optionsContainer') || $('options');
      if (container) container.innerHTML = '';
      rowSeq = 0;
      addRow('Đồng ý', '', 'Tán thành với đề xuất');
      addRow('Phản đối', '', 'Không đồng ý với đề xuất');
      addRow('Phiếu trắng', '', 'Không có ý kiến hoặc giữ vị trí trung lập');
      refresh();
    });
  }

  if ($('submit')) $('submit').addEventListener('click', submit);

  // Bắt sự kiện Bản nháp & Xem trước
  if ($('btnSaveDraft')) {
    $('btnSaveDraft').addEventListener('click', async () => {
      const d = await saveCurrentDraft();
      if (d && $('btnViewDraftsBottom')) {
        $('btnViewDraftsBottom').classList.add('animate-bounce');
        setTimeout(() => $('btnViewDraftsBottom').classList.remove('animate-bounce'), 1800);
      }
    });
  }

  if ($('btnViewDraftsBottom')) $('btnViewDraftsBottom').addEventListener('click', showDraftsModal);

  if ($('btnPreview')) {
    $('btnPreview').addEventListener('click', () => {
      const f = collect();
      showPreviewModal(f);
    });
  }

  if ($('btnOpenDrafts')) $('btnOpenDrafts').addEventListener('click', showDraftsModal);
  if ($('btnQuickDrafts')) $('btnQuickDrafts').addEventListener('click', showDraftsModal);
  if ($('btnOpenDraftsCard')) $('btnOpenDraftsCard').addEventListener('click', showDraftsModal);

  if ($('btnCloseDrafts')) $('btnCloseDrafts').addEventListener('click', hideDraftsModal);
  if ($('btnCloseDraftsBtn')) $('btnCloseDraftsBtn').addEventListener('click', hideDraftsModal);
  if ($('btnClearAllDrafts')) $('btnClearAllDrafts').addEventListener('click', clearAllDrafts);

  if ($('btnClosePreview')) $('btnClosePreview').addEventListener('click', hidePreviewModal);
  if ($('btnPreviewBack')) $('btnPreviewBack').addEventListener('click', hidePreviewModal);
  if ($('btnPreviewSave')) {
    $('btnPreviewSave').addEventListener('click', async () => {
      await saveCurrentDraft();
      $('btnPreviewSave').innerHTML = '<span class="material-symbols-outlined text-[18px] text-tertiary">check_circle</span> Đã lưu bản nháp';
      setTimeout(() => {
        if ($('btnPreviewSave')) {
          $('btnPreviewSave').innerHTML = '<span class="material-symbols-outlined text-[18px] text-amber-600">save</span> Lưu bản nháp này';
        }
      }, 3000);
    });
  }
  if ($('btnPreviewDeploy')) {
    $('btnPreviewDeploy').addEventListener('click', () => {
      hidePreviewModal();
      submit();
    });
  }

  // Đóng Modal khi bấm phím Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hidePreviewModal();
      hideDraftsModal();
    }
  });

  // Thêm 2 hàng lựa chọn ban đầu
  const container = $('optionsContainer') || $('options');
  if (container) container.innerHTML = '';
  rowSeq = 0;
  addRow('', '', '');
  addRow('', '', '');
  applyKind();

  updateOwnerUI();
  updateDraftsUI();

  // Kiểm tra nếu được mở từ URL có tham số ?draftId=...
  const urlParams = new URLSearchParams(window.location.search);
  const draftIdParam = urlParams.get('draftId');
  if (draftIdParam) {
    const d = getDrafts().find((x) => x.id === draftIdParam);
    if (d) {
      loadDraftToForm(d);
    }
  }
})();
