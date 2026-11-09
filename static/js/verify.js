(async () => {
  await App.init();
  const $ = (id) => document.getElementById(id);
  const esc = App.esc;

  function show(html) { $('result').innerHTML = html; }

  async function verify() {
    const tx = $('tx').value.trim();
    if (!tx) return;
    $('btnVerify').disabled = true;
    
    // ĐÃ SỬA: Giao diện "Đang tải" tinh tế, bo góc
    show(`<div class="empty" style="text-align:center; padding:40px; background:#ffffff; border:1px dashed #cbd5e1; border-radius:12px; box-shadow:var(--shadow-sm);">
        <i class="fa-solid fa-spinner fa-spin fa-2x" style="color:var(--accent); margin-bottom:16px; display:block;"></i>
        <span style="color:var(--text-main); font-weight:500;">Đang truy vấn blockchain...</span>
    </div>`);
    
    try {
      const d = await App.api('/api/verify/?tx=' + encodeURIComponent(tx));
      const link = (h) => `<a target="_blank" rel="noopener" href="${esc(App.cfg.explorer_url)}/tx/${esc(h)}" style="display:inline-flex; align-items:center; gap:6px; font-weight:600; margin-top:8px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Xem trên Etherscan</a>`;
      
      if (d.status === 'confirmed') {
        show(`<div style="background:#ffffff; border:1px solid var(--glass-border); border-radius:12px; padding:24px; box-shadow:var(--shadow-sm);">
          <div class="notice ok" style="background:var(--ok-soft); border-left:4px solid var(--ok); padding:16px; border-radius:8px; margin-bottom:24px; display:flex; align-items:center; gap:12px;">
              <i class="fa-solid fa-circle-check fa-2x" style="color:var(--ok);"></i> 
              <div>
                  <b style="color:var(--ok); display:block; margin-bottom:4px; font-size:1.1rem;">Phiếu bầu hợp lệ</b>
                  <span style="color:var(--text-main); font-size:0.95rem;">Giao dịch đã được ghi nhận vĩnh viễn trên blockchain và đồng bộ vào hệ thống.</span>
              </div>
          </div>
          <div class="table-wrap" style="overflow-x:auto;">
              <table style="width:100%; border-collapse:collapse; text-align:left;">
                <tbody>
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <th style="padding:16px 12px; width:200px; color:var(--text-muted); font-weight:500;">Hòm phiếu</th>
                        <td style="padding:16px 12px; font-weight:600;"><a href="/election/${esc(d.election.address)}/">${esc(d.election.name)}</a></td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <th style="padding:16px 12px; color:var(--text-muted); font-weight:500;">Cử tri bỏ phiếu</th>
                        <td style="padding:16px 12px; font-family:monospace; font-size:1.05rem;">${App.addrLink(d.voter)}</td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <th style="padding:16px 12px; color:var(--text-muted); font-weight:500;">Lựa chọn</th>
                        <td style="padding:16px 12px;">${d.choice_labels.map((l) => `<span class="badge" style="background:#f8fafc; border:1px solid #cbd5e1; color:#334155; padding:6px 12px;"><i class="fa-solid fa-check" style="color:var(--ok); margin-right:6px;"></i>${esc(l)}</span>`).join(' ')}</td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <th style="padding:16px 12px; color:var(--text-muted); font-weight:500;">Block</th>
                        <td style="padding:16px 12px; font-family:monospace;">#${esc(d.block)}</td>
                    </tr>
                    <tr style="border-bottom:1px solid var(--glass-border);">
                        <th style="padding:16px 12px; color:var(--text-muted); font-weight:500;">Thời gian ghi nhận</th>
                        <td style="padding:16px 12px; color:var(--text-main); font-weight:500;">${esc(App.fmtDate(d.time))}</td>
                    </tr>
                    <tr>
                        <th style="padding:16px 12px; color:var(--text-muted); font-weight:500; vertical-align:top;">Mã giao dịch</th>
                        <td style="padding:16px 12px;">
                            <div style="font-family:monospace; color:var(--text-muted); word-break:break-all;">${esc(d.tx_hash)}</div>
                            ${link(d.tx_hash)}
                        </td>
                    </tr>
                </tbody>
              </table>
          </div>
        </div>`);
      } else if (d.status === 'pending_index') {
        show(`<div class="notice warn" style="background:var(--warn-soft); border-left:4px solid var(--warn); padding:16px; border-radius:12px; display:flex; gap:12px; align-items:flex-start;">
          <i class="fa-solid fa-clock-rotate-left fa-2x" style="color:var(--warn); margin-top:4px;"></i>
          <div>
              <b style="color:var(--warn); display:block; margin-bottom:6px; font-size:1.1rem;">Đang chờ đồng bộ</b>
              Giao dịch đã thành công trên blockchain (block ${esc(d.block)}) cho hòm phiếu <a href="/election/${esc(d.election.address)}/" style="font-weight:600;">${esc(d.election.name)}</a>, nhưng hệ thống chưa kịp đồng bộ. Hãy tải lại trang sau vài giây.
          </div>
        </div>`);
      } else if (d.status === 'failed') {
        show(`<div class="notice error" style="background:var(--danger-soft); border-left:4px solid var(--danger); padding:16px; border-radius:12px; display:flex; align-items:center; gap:12px;">
            <i class="fa-solid fa-circle-xmark fa-xl" style="color:var(--danger);"></i>
            <span style="color:var(--danger); font-weight:500;">Giao dịch này đã thất bại trên blockchain — phiếu KHÔNG được tính.</span>
        </div>`);
      } else if (d.status === 'not_vote') {
        show(`<div class="notice warn" style="background:#f1f5f9; border-left:4px solid #94a3b8; padding:16px; border-radius:12px; display:flex; align-items:center; gap:12px;">
            <i class="fa-solid fa-circle-info fa-xl" style="color:#64748b;"></i>
            <span style="color:#334155; font-weight:500;">Giao dịch có tồn tại nhưng không phải là giao dịch bỏ phiếu của nền tảng VoteChain.</span>
        </div>`);
      } else {
        show(`<div class="notice error" style="background:var(--danger-soft); border-left:4px solid var(--danger); padding:16px; border-radius:12px; display:flex; align-items:center; gap:12px;">
            <i class="fa-solid fa-magnifying-glass-minus fa-xl" style="color:var(--danger);"></i>
            <span style="color:var(--danger); font-weight:500;">Không tìm thấy giao dịch này trên mạng. Nếu bạn vừa gửi, hãy đợi vài giây rồi thử lại.</span>
        </div>`);
      }
    } catch (e) {
      show(`<div class="notice error" style="background:var(--danger-soft); border-left:4px solid var(--danger); padding:16px; border-radius:12px; color:var(--danger); display:flex; align-items:center; gap:12px;"><i class="fa-solid fa-triangle-exclamation fa-xl"></i> <span>${esc(e.message)}</span></div>`);
    }
    $('btnVerify').disabled = false;
  }

  $('btnVerify').addEventListener('click', verify);
  $('tx').addEventListener('keydown', (e) => { if (e.key === 'Enter') verify(); });
  
  const pre = new URLSearchParams(location.search).get('tx');
  if (pre) { $('tx').value = pre; verify(); }
})();