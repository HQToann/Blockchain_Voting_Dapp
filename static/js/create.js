(async () => {
  await App.init();
  const cfg = App.cfg, L = cfg.limits;
  const $ = (id) => document.getElementById(id);
  const bytes = (s) => new TextEncoder().encode(s).length;
  const radio = (name) => document.querySelector(`input[name=${name}]:checked`).value;
  let rowSeq = 0;
// ------------------------------------------------------------- danh sách lựa chọn
  function addRow(label = '') {
    const id = ++rowSeq;
    const div = document.createElement('div');
    div.className = 'option-row';
    div.dataset.id = id;
    
    // ĐÃ SỬA: Giao diện chuẩn 100% theo ảnh mockup của bạn
    div.innerHTML = `
      <div style="padding: 16px; border: 1px solid var(--glass-border); border-radius: 12px; background: #ffffff; margin-bottom: 16px;">
          <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px;">
              <input type="text" class="o-label" maxlength="100" placeholder="Tên ứng viên hoặc lựa chọn" value="${App.esc(label)}" style="flex: 1; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; color: var(--text-main); padding: 12px 16px;" required>
              
              <!-- Nút xóa màu xám đồng bộ theo thiết kế -->
              <button type="button" class="btn btn-sm o-del" style="background: #cbd5e1; color: #475569; width: 46px; height: 46px; padding: 0; display: flex; align-items: center; justify-content: center; border-radius: 8px;" title="Xoá">
                  <i class="fa-solid fa-trash"></i>
              </button>
          </div>
          
          <!-- Trường mô tả ẩn đi để không bị lỗi JS khi gửi data -->
          <input type="hidden" class="o-desc" value="">
          
          <!-- Nút tải ảnh lên từ máy nằm full ngang ở dưới -->
          <input type="file" class="o-file" accept="image/png,image/jpeg,image/gif,image/webp" style="width: 100%; font-size: 0.9rem; padding: 10px; background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px; color: var(--text-muted);" required>
          
          <!-- Nơi hiển thị trước ảnh (Preview) -->
          <img class="thumb hidden" alt="" style="margin-top: 12px; max-height: 120px; border-radius: 8px; border: 1px solid var(--glass-border);">
      </div>`;
    div.querySelector('.o-del').addEventListener('click', () => { div.remove(); refresh(); });
    div.querySelector('.o-file').addEventListener('change', (e) => {
      const f = e.target.files[0], img = div.querySelector('.thumb');
      if (f && f.size > L.max_image_bytes) { App.toast(`Ảnh quá lớn (tối đa ${L.max_image_bytes / 1048576} MB).`, 'error'); e.target.value = ''; }
      const ok = e.target.files[0];
      img.classList.toggle('hidden', !ok);
      if (ok) img.src = URL.createObjectURL(ok);
    });
    div.querySelector('.o-label').addEventListener('input', refresh);
    
    // Xử lý container an toàn (fallback nếu ID HTML khác nhau)
    const container = $('optionsContainer') || $('options');
    if (container) container.appendChild(div);
    refresh();
    return div;
  }
  
  function rows() {
    const container = $('optionsContainer') || $('options');
    return container ? [...container.querySelectorAll('.option-row')] : [];
  }

  function refresh() {
    const n = rows().length;
    if ($('optCount')) $('optCount').textContent = `${n}/${L.max_options} lựa chọn`;
    const addBtn = $('addOpt') || $('btnAddOption');
    if (addBtn) addBtn.disabled = n >= L.max_options;
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
              : `Mỗi cử tri được chọn từ 1 đến ${k} trong ${n} lựa chọn.`;
        }
    }
  }

  function applyKind() {
    const kindEl = document.querySelector('input[name=kind]:checked');
    if (!kindEl) return;
    const proposal = kindEl.value === '1';
    if ($('nameLabel')) $('nameLabel').textContent = proposal ? 'Câu hỏi / vấn đề cần lấy ý kiến' : 'Tên cuộc bầu cử';
    if ($('name')) $('name').placeholder = proposal ? 'VD: Có nên đổi giờ họp sang buổi tối?' : 'VD: Bầu Chủ nhiệm CLB nhiệm kỳ 2026';
    if ($('optTitle')) $('optTitle').textContent = proposal ? 'Các đáp án' : 'Danh sách ứng viên';
    if ($('tplYesNo')) $('tplYesNo').classList.toggle('hidden', !proposal);
  }

  // ------------------------------------------------------------- kiểm tra (khớp luật của contract)
  function collect() {
    const kindEl = document.querySelector('input[name=kind]:checked');
    const privEl = document.querySelector('input[name=priv]:checked');
    const startEl = document.querySelector('input[name=startMode]:checked');
    const endEl = document.querySelector('input[name=endMode]:checked');
    
    return {
      kind: kindEl ? +kindEl.value : 0, 
      name: ($('name') || $('title')).value.trim(), 
      description: $('desc') ? $('desc').value.trim() : '',
      isPrivate: privEl ? privEl.value === '1' : false, 
      maxChoices: $('maxChoices') ? +$('maxChoices').value : 1,
      startMode: startEl ? startEl.value : 'now', 
      endMode: endEl ? endEl.value : 'at',
      options: rows().map((r) => ({
        label: r.querySelector('.o-label').value.trim(),
        description: r.querySelector('.o-desc').value.trim(),
        file: r.querySelector('.o-file').files[0] || null,
      })),
    };
  }

  function validate(f) {
    const errs = [];
    if (!f.name) errs.push('Hãy nhập tên/câu hỏi.');
    if (bytes(f.name) > L.max_name_bytes) errs.push(`Tên quá dài (tối đa ${L.max_name_bytes} byte).`);
    if (f.options.length < L.min_options) errs.push(`Cần ít nhất ${L.min_options} lựa chọn.`);
    const seen = new Set();
    f.options.forEach((o, i) => {
      if (!o.label) errs.push(`Lựa chọn #${i + 1} đang để trống.`);
      else if (bytes(o.label) > L.max_label_bytes) errs.push(`Lựa chọn #${i + 1} quá dài.`);
      const key = o.label.toLowerCase();
      if (o.label && seen.has(key)) errs.push(`Lựa chọn "${o.label}" bị trùng.`);
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
    
    // Fallback cho form dùng ID endTime thay vì endAt
    const endTimeInput = $('endAt') || $('endTime');
    if (f.endMode === 'at' && endTimeInput) {
      end = App.toUnix(endTimeInput.value);
      if (!end) errs.push('Hãy chọn thời điểm kết thúc.');
      else if (end <= Math.max(start, now + 60)) errs.push('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    }
    return { errs, start, end };
  }

  // ------------------------------------------------------------- gửi (Modal Giao diện sáng)
  const steps = [];
  function showModal() {
    let m = $('progressModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'progressModal';
      m.className = 'modal-overlay';
      m.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.4); backdrop-filter: blur(4px); z-index: 999; display: flex; align-items: center; justify-content: center;';
      m.innerHTML = `
        <div class="modal-content" style="background: #ffffff; padding: 32px; border-radius: 16px; box-shadow: var(--shadow-lg); width: 100%; max-width: 420px; border: 1px solid var(--glass-border);">
            <h3 style="color: var(--text-main); margin-bottom: 24px; text-align: center;"><i class="fa-solid fa-cube" style="color: var(--accent); margin-right: 8px;"></i>Đang khởi tạo hòm phiếu...</h3>
            <div id="modalSteps" class="progress-steps" style="display: flex; flex-direction: column; gap: 12px;"></div>
        </div>`;
      document.body.appendChild(m);
    }
  }
  function hideModal() { const m = $('progressModal'); if (m) m.remove(); }
  
  function step(text) {
    steps.push(text);
    showModal();
    $('modalSteps').innerHTML = steps.map((s, i) => {
      const isLast = i === steps.length - 1;
      return `
        <div class="${isLast ? 'active' : 'done'}" style="display: flex; align-items: center; gap: 12px; color: ${isLast ? 'var(--accent)' : 'var(--text-muted)'}; font-weight: ${isLast ? '600' : '500'};">
            ${isLast ? '<i class="fa-solid fa-spinner fa-spin"></i>' : '<i class="fa-solid fa-circle-check" style="color: var(--ok);"></i>'} 
            <span>${App.esc(s)}</span>
        </div>`;
    }).join('');
  }

  async function submit() {
    const f = collect();
    const { errs, start, end } = validate(f);
    
    // Nếu có container báo lỗi thì hiển thị, nếu không dùng Toast
    if ($('errors')) {
        $('errors').classList.toggle('hidden', !errs.length);
        $('errors').innerHTML = errs.map((e) => '• ' + App.esc(e)).join('<br>');
    } else if (errs.length > 0) {
        App.toast(errs[0], 'error');
    }
    
    if (errs.length) return window.scrollTo(0, 0);
    if (!cfg.factory_address) return App.toast('Nền tảng chưa cấu hình Factory.', 'error');

    const submitBtn = $('submit') || $('btnSubmit');
    if (submitBtn) submitBtn.disabled = true; 
    steps.length = 0;
    
    try {
      step('Kết nối ví…');
      await App.connect();

      const needMeta = f.description || f.options.some((o) => o.description || o.file);
      let metadataURI = '';
      if (needMeta) {
        if (!cfg.ipfs_enabled) throw new Error('Máy chủ chưa bật IPFS: hãy bỏ mô tả/ảnh hoặc liên hệ quản trị.');
        step('Xác nhận chủ ví (ký tin nhắn, không tốn gas)…');
        await App.ensureLogin();
        const metaOptions = [];
        for (let i = 0; i < f.options.length; i++) {
          const o = f.options[i];
          let image = '';
          if (o.file) {
            step(`Tải ảnh ${i + 1}/${f.options.length} lên IPFS…`);
            const form = new FormData(); form.append('image', o.file);
            image = (await App.api('/api/ipfs/image/', { method: 'POST', form })).cid;
          }
          metaOptions.push({ label: o.label, description: o.description, image });
        }
        step('Ghim mô tả lên IPFS…');
        metadataURI = (await App.api('/api/ipfs/metadata/', { method: 'POST', json: { description: f.description, options: metaOptions } })).cid;
      }

      step('Gửi giao dịch tạo hòm phiếu — hãy xác nhận trong ví…');
      const factory = App.factoryContract(App.state.signer);
      const params = { name: f.name, metadataURI, kind: f.kind, isPrivate: f.isPrivate, maxChoices: f.maxChoices,
                       startTime: start, endTime: end, options: f.options.map((o) => o.label) };
      const tx = await factory.createElection(params);
      step('Đang chờ blockchain xác nhận…');
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch (_) { return null; } })
                              .find((e) => e && e.name === 'ElectionCreated');
      if (!ev) throw new Error('Giao dịch thành công nhưng không đọc được địa chỉ hòm phiếu. Xem mục "Của tôi".');
      step('Hoàn tất! Đang chuyển tới hòm phiếu…');
      location.href = `/election/${ev.args.election}/?new=1`;
    } catch (e) {
      hideModal();
      if (e.message !== 'NO_WALLET') {
        if ($('errors')) {
            $('errors').classList.remove('hidden');
            $('errors').textContent = App.errMsg(e);
        } else {
            App.toast(App.errMsg(e), 'error');
        }
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // ------------------------------------------------------------- khởi tạo
  document.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', applyKind));
  document.querySelectorAll('input[name=startMode]').forEach((r) => r.addEventListener('change', () => { if ($('startAt')) $('startAt').classList.toggle('hidden', radio('startMode') !== 'at'); }));
  document.querySelectorAll('input[name=endMode]').forEach((r) => r.addEventListener('change', () => { if ($('endAt')) $('endAt').classList.toggle('hidden', radio('endMode') !== 'at'); }));
  
  if ($('maxChoices')) $('maxChoices').addEventListener('input', refresh);
  if ($('addOpt') || $('btnAddOption')) ($('addOpt') || $('btnAddOption')).addEventListener('click', () => addRow());
  if ($('tplYesNo')) $('tplYesNo').addEventListener('click', () => {
    const container = $('optionsContainer') || $('options');
    if (container) container.innerHTML = ''; 
    addRow('Đồng ý'); addRow('Không đồng ý'); addRow('Phiếu trắng / Không ý kiến'); refresh();
  });
  
  if ($('submit') || $('btnSubmit')) ($('submit') || $('btnSubmit')).addEventListener('click', submit);
  if ($('needWallet')) $('needWallet').classList.toggle('hidden', !!App.state.address);
  
  // Khởi tạo giao diện bằng 2 dòng trống
  const container = $('optionsContainer') || $('options');
  if (container) container.innerHTML = '';
  addRow(); addRow(); applyKind();
})();