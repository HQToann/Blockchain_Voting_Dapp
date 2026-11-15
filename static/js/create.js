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
        <label class="w-20 h-20 rounded-2xl overflow-hidden bg-surface-container-high border border-outline-variant/40 shadow-sm relative group cursor-pointer flex items-center justify-center text-outline">
          <input type="file" class="o-file sr-only" accept="image/png,image/jpeg,image/webp">
          <img class="thumb w-full h-full object-cover hidden" alt="Ảnh ứng viên">
          <span class="placeholder-icon material-symbols-outlined text-[32px] group-hover:scale-110 transition-transform">account_circle</span>
          <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold">
            <span class="material-symbols-outlined text-[20px]">photo_camera</span>
          </div>
        </label>
        <span class="font-label-tag text-label-tag text-outline text-[10px] uppercase font-bold tracking-wider">
          Ảnh đại diện
        </span>
      </div>

      <!-- Right: Candidate Fields -->
      <div class="flex-1 w-full space-y-space-xs">
        <div class="flex items-center justify-between gap-space-sm">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-space-sm flex-1">
            <div class="space-y-1">
              <label class="o-label-title font-headline-sm text-headline-sm text-on-surface font-semibold text-xs">Tên ứng viên #${id}</label>
              <input type="text" class="o-label w-full bg-surface-container-lowest border border-outline-variant/50 focus:border-primary px-3 py-2 rounded-xl font-headline-sm text-headline-sm text-on-surface outline-none font-semibold text-sm transition-all" placeholder="Nhập họ và tên ứng viên..." value="${App.esc(label)}">
            </div>
            <div class="space-y-1">
              <label class="o-role-title font-headline-sm text-headline-sm text-on-surface font-semibold text-xs">Chức vụ / Đơn vị đề cử</label>
              <input type="text" class="o-role w-full bg-surface-container-lowest border border-outline-variant/50 focus:border-primary px-3 py-2 rounded-xl font-body-md text-body-md text-on-surface outline-none text-sm transition-all" placeholder="VD: Lớp trưởng, Trưởng ban..." value="${App.esc(role)}">
            </div>
          </div>

          <div class="flex items-center gap-1.5 self-start pt-5">
            <span class="o-id-badge px-2 py-0.5 rounded-md bg-surface-container-high text-primary font-label-code text-label-code font-bold text-xs">
              ID: #${idStr}
            </span>
            <button type="button" class="o-del text-outline hover:text-error transition-colors p-1 cursor-pointer" title="Xóa dòng này">
              <span class="material-symbols-outlined text-[20px]">delete</span>
            </button>
          </div>
        </div>

        <div class="space-y-1 pt-1">
          <label class="font-headline-sm text-headline-sm text-on-surface-variant font-medium text-xs">Cương lĩnh hành động tóm tắt</label>
          <input type="text" class="o-desc w-full bg-surface-container-lowest border border-outline-variant/50 focus:border-primary px-3 py-2 rounded-xl font-body-sm text-body-sm text-on-surface outline-none transition-all" placeholder="Nêu các cam kết hoặc mục tiêu chính..." value="${App.esc(desc)}">
        </div>
      </div>
    `;
  }

  // 3. Thêm một hàng ứng viên / lựa chọn
  function addRow(label = '', role = '', desc = '') {
    const id = ++rowSeq;
    const div = document.createElement('div');
    div.className = 'candidate-row rounded-2xl p-space-md bg-surface-container-low/50 border border-surface-container-high hover:border-primary/40 transition-all flex flex-col md:flex-row items-start gap-space-md relative';
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

    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f && f.size > L.max_image_bytes) {
        App.toast(`Ảnh quá lớn (tối đa ${L.max_image_bytes / 1048576} MB).`, 'error');
        e.target.value = '';
        imgThumb.classList.add('hidden');
        placeholderIcon.classList.remove('hidden');
        return;
      }
      if (f) {
        imgThumb.src = URL.createObjectURL(f);
        imgThumb.classList.remove('hidden');
        placeholderIcon.classList.add('hidden');
      } else {
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
      maxChoices: $('maxChoices') ? +$('maxChoices').value : 1,
      startMode: radio('startMode') || 'now',
      endMode: radio('endMode') || 'none',
      options: rows().map((r) => ({
        label: r.querySelector('.o-label').value.trim(),
        role: r.querySelector('.o-role') ? r.querySelector('.o-role').value.trim() : '',
        description: r.querySelector('.o-desc').value.trim(),
        file: r.querySelector('.o-file').files[0] || null,
      })),
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

  // Thêm 2 hàng lựa chọn ban đầu
  const container = $('optionsContainer') || $('options');
  if (container) container.innerHTML = '';
  rowSeq = 0;
  addRow('', '', '');
  addRow('', '', '');
  applyKind();

  updateOwnerUI();
})();
