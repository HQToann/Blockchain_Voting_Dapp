(async () => {
  await App.init();
  const cfg = App.cfg, L = cfg.limits;
  const $ = (id) => document.getElementById(id);
  const bytes = (s) => new TextEncoder().encode(s).length;
  const radio = (name) => document.querySelector(`input[name=${name}]:checked`)?.value;
  let rowSeq = 0;

  function addRow(label = '') {
    const id = ++rowSeq;
    const div = document.createElement('div');
    div.className = 'option-row';
    div.dataset.id = id;

    div.style.cssText = 'border: 1px solid #e2e8f0; border-radius: 8px; background: #ffffff; overflow: hidden;';

    div.innerHTML = `
      <div style="display: flex; padding: 12px 16px; gap: 12px; align-items: center; border-bottom: 1px solid #f1f5f9;">
          <div style="color: #64748b;"><i class="fa-solid fa-user-tie"></i></div>
          <input type="text" class="o-label" maxlength="100" placeholder="Nhập họ và tên ứng viên..." value="${App.esc(label)}" style="flex: 1; border: none; outline: none; font-weight: 600; color: #334155; font-size: 0.95rem; background: transparent;">
          <button type="button" class="o-del" style="background: #fee2e2; color: #ef4444; border: none; width: 32px; height: 32px; border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: 0.2s;" title="Xóa dòng này">
              <i class="fa-solid fa-trash-can"></i>
          </button>
      </div>
      
      <div style="padding: 16px; background: #f8fafc;">
          <div style="margin-bottom: 8px; font-size: 0.85rem; font-weight: 600; color: #3b82f6; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-image"></i> Thêm Hình ảnh & Mô tả (Tùy chọn)
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;">
              <textarea class="o-desc" maxlength="500" placeholder="Mô tả chi tiết về ứng viên hoặc lựa chọn này (tối đa 500 ký tự)" style="width: 100%; border: none; outline: none; resize: vertical; min-height: 60px; font-family: inherit; font-size: 0.9rem; color: #475569; margin-bottom: 12px;"></textarea>
              <div style="display: flex; justify-content: flex-end; color: #94a3b8;"><i class="fa-solid fa-pen-clip"></i></div>
          </div>

          <div style="margin-top: 16px; display: flex; gap: 16px; align-items: flex-start;">
              <div style="flex: 1;">
                  <div style="font-size: 0.85rem; font-weight: 600; color: #334155; margin-bottom: 8px;">Tải ảnh đại diện:</div>
                  <div style="display: flex; align-items: center; gap: 8px;">
                      <input type="file" class="o-file" accept="image/png,image/jpeg,image/webp" style="flex: 1; padding: 6px; border: 1px dashed #94a3b8; border-radius: 4px; font-size: 0.85rem; background: #ffffff; color: #64748b; cursor: pointer;">
                  </div>
                  <div style="font-size: 0.75rem; color: #64748b; margin-top: 6px;">
                      <i class="fa-solid fa-circle-info"></i> Hỗ trợ PNG, JPG, WEBP. Ảnh sẽ được lưu trữ phi tập trung trên IPFS.
                  </div>
              </div>
              <img class="thumb hidden" style="width: 60px; height: 60px; border-radius: 50%; object-fit: cover; border: 1px solid #e2e8f0;">
          </div>
      </div>
    `;

    div.querySelector('.o-del').addEventListener('click', () => { div.remove(); refresh(); });
    
    const fileInput = div.querySelector('.o-file');
    const imgThumb = div.querySelector('.thumb');
    
    fileInput.addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f && f.size > L.max_image_bytes) {
          App.toast(`Ảnh quá lớn (tối đa ${L.max_image_bytes / 1048576} MB).`, 'error');
          e.target.value = '';
      }
      const ok = e.target.files[0];
      if (ok) {
          imgThumb.src = URL.createObjectURL(ok);
          imgThumb.classList.remove('hidden');
      } else {
          imgThumb.classList.add('hidden');
      }
    });

    div.querySelector('.o-label').addEventListener('input', refresh);

    const container = $('optionsContainer') || $('options');
    if (container) container.appendChild(div);

    refresh();
    applyKind(); 
    return div;
  }

  function rows() {
    const container = $('optionsContainer') || $('options');
    return container ? [...container.querySelectorAll('.option-row')] : [];
  }

  function refresh() {
    const rws = rows();
    const n = rws.length;
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
              : `Được chọn từ 1 đến ${k} trong ${n} lựa chọn.`;
        }
    }
  }

  function applyKind() {
    const kindEl = document.querySelector('input[name=kind]:checked');
    if (!kindEl) return;
    const proposal = kindEl.value === '1';
    
    if ($('nameLabel')) $('nameLabel').innerHTML = proposal ? 'Câu hỏi / vấn đề cần lấy ý kiến <span style="color: #ef4444;">*</span>' : 'Tên cuộc bầu cử <span style="color: #ef4444;">*</span>';
    if ($('name')) $('name').placeholder = proposal ? 'VD: Có nên đổi giờ sinh hoạt sang buổi tối?' : 'VD: Bầu Chủ nhiệm Câu lạc bộ nhiệm kỳ 2026';
    if ($('optTitle')) $('optTitle').innerHTML = proposal ? '<i class="fa-solid fa-list-check" style="color: #64748b;"></i> Các đáp án' : '<i class="fa-solid fa-list-check" style="color: #64748b;"></i> Danh sách Ứng viên';

    document.querySelectorAll('.option-row').forEach((r) => {
        const icon = r.querySelector('.fa-user-tie, .fa-users');
        if (icon) {
            icon.className = proposal ? 'fa-solid fa-users' : 'fa-solid fa-user-tie';
        }
        
        const inputLabel = r.querySelector('.o-label');
        if (inputLabel) {
            inputLabel.placeholder = proposal ? 'Ví dụ: Đồng ý / Phản đối' : 'Nhập họ và tên ứng viên...';
        }
    });
    
    // Tự động hoán đổi 2 nút theo loại hòm phiếu
    if ($('addOpt')) $('addOpt').classList.toggle('hidden', proposal);
    if ($('tplYesNo')) $('tplYesNo').classList.toggle('hidden', !proposal);
  }

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
    
    const endTimeInput = $('endAt') || $('endTime');
    if (f.endMode === 'at' && endTimeInput) {
      end = App.toUnix(endTimeInput.value);
      if (!end) errs.push('Hãy chọn thời điểm kết thúc.');
      else if (end <= Math.max(start, now + 60)) errs.push('Thời điểm kết thúc phải sau thời điểm bắt đầu.');
    }
    return { errs, start, end };
  }

  const steps = [];
  function showModal() {
    let m = $('progressModal');
    if (!m) {
      m = document.createElement('div');
      m.id = 'progressModal';
      m.className = 'modal-overlay';
      m.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(15, 23, 42, 0.6); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center;';
      m.innerHTML = `
        <div class="modal-content" style="background: #ffffff; padding: 32px; border-radius: 12px; width: 100%; max-width: 420px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 24px;">
                <h3 style="margin: 0; color: #1e293b; font-size: 1.25rem;">Khởi tạo Hòm phiếu</h3>
                <p style="margin: 8px 0 0 0; font-size: 0.9rem; color: #64748b;">Vui lòng không đóng trình duyệt lúc này</p>
            </div>
            <div id="modalSteps" class="progress-steps" style="display: flex; flex-direction: column; gap: 16px;"></div>
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
      const icon = isLast 
          ? '<i class="fa-solid fa-circle-notch fa-spin" style="color: #3b82f6;"></i>' 
          : '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i>';
      const color = isLast ? '#1e293b' : '#64748b';
      
      return `
        <div style="display: flex; align-items: center; gap: 12px; color: ${color}; font-size: 0.95rem;">
            <div style="width: 24px; display: flex; justify-content: center;">${icon}</div>
            <span style="flex: 1;">${App.esc(s)}</span>
        </div>`;
    }).join('');
  }

  async function submit() {
    const f = collect();
    const { errs, start, end } = validate(f);
    
    if ($('errors')) {
        $('errors').classList.toggle('hidden', !errs.length);
        $('errors').innerHTML = errs.map((e) => '• ' + App.esc(e)).join('<br>');
    }
    
    if (errs.length) return window.scrollTo(0, 0);
    if (!cfg.factory_address) return App.toast('Nền tảng chưa cấu hình Factory Address.', 'error');

    const submitBtn = $('submit');
    if (submitBtn) submitBtn.disabled = true; 
    steps.length = 0;
    
    try {
      step('Kết nối ví MetaMask…');
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
        step('Ghim dữ liệu lên IPFS…');
        metadataURI = (await App.api('/api/ipfs/metadata/', { method: 'POST', json: { description: f.description, options: metaOptions } })).cid;
      }

      step('Gửi giao dịch tạo hòm phiếu — xác nhận trong MetaMask…');
      const factory = App.factoryContract(App.state.signer);
      const params = { name: f.name, metadataURI, kind: f.kind, isPrivate: f.isPrivate, maxChoices: f.maxChoices,
                       startTime: start, endTime: end, options: f.options.map((o) => o.label) };
      const tx = await factory.createElection(params);
      
      step('Đang chờ Blockchain xác nhận…');
      const receipt = await tx.wait();
      const ev = receipt.logs.map((l) => { try { return factory.interface.parseLog(l); } catch (_) { return null; } })
                              .find((e) => e && e.name === 'ElectionCreated');
      if (!ev) throw new Error('Thành công nhưng không lấy được địa chỉ. Xem ở "Của tôi".');
      
      step('Hoàn tất! Đang chuyển hướng…');
      location.href = `/election/${ev.args.election}/?new=1`;
    } catch (e) {
      hideModal();
      if (e.message !== 'NO_WALLET') {
        if ($('errors')) {
            $('errors').classList.remove('hidden');
            $('errors').textContent = App.errMsg(e);
        }
      }
      if (submitBtn) submitBtn.disabled = false;
    }
  }

  // Khởi tạo
  document.querySelectorAll('input[name=kind]').forEach((r) => r.addEventListener('change', applyKind));
  document.querySelectorAll('input[name=startMode]').forEach((r) => r.addEventListener('change', () => { if ($('startAt')) $('startAt').classList.toggle('hidden', radio('startMode') !== 'at'); }));
  document.querySelectorAll('input[name=endMode]').forEach((r) => r.addEventListener('change', () => { if ($('endAt')) $('endAt').classList.toggle('hidden', radio('endMode') !== 'at'); }));
  
  if ($('maxChoices')) $('maxChoices').addEventListener('input', refresh);
  if ($('addOpt')) $('addOpt').addEventListener('click', () => addRow());
  
  if ($('tplYesNo')) $('tplYesNo').addEventListener('click', () => {
    const container = $('optionsContainer') || $('options');
    if (container) container.innerHTML = ''; 
    addRow('Đồng ý'); addRow('Phản đối'); addRow('Phiếu trắng / Không ý kiến'); refresh();
  });
  
  if ($('submit')) $('submit').addEventListener('click', submit);
  if ($('needWallet')) $('needWallet').classList.toggle('hidden', !!App.state.address);
  
  const container = $('optionsContainer') || $('options');
  if (container) container.innerHTML = '';
  
  addRow(); addRow(); applyKind();
})();