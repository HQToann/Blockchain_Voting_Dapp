/**
 * Logic điều khiển trang Xác Minh Phiếu Bầu (Vote Verification)
 * Tích hợp Backend API (/api/verify/), Node Sepolia RPC & Trình duyệt sổ cái
 */
(async () => {
  await App.init();
  const $ = App.$;
  const esc = App.esc;

  // 1. Cập nhật trạng thái Node & Khối đồng bộ từ Backend
  async function updateNodeStatus() {
    try {
      const health = await App.api('/api/health/');
      if (health && health.indexer) {
        if ($('nodeBlock') && health.indexer.last_block) {
          $('nodeBlock').textContent = `Khối #${health.indexer.last_block.toLocaleString('vi-VN')}`;
        }
        if ($('nodeStatus')) {
          $('nodeStatus').textContent = health.indexer.lagging ? 'Đang trễ khối' : 'Sepolia RPC OK';
        }
      }
    } catch (_) { }
  }
  updateNodeStatus();

  function show(html) {
    $('result').innerHTML = html;
  }

  // 2. Render từng lựa chọn đã bầu trên biên lai
  function renderChoiceItem(cid, idx, optionsMap, choiceLabels) {
    const opt = optionsMap[cid] || {};
    const label = opt.label || choiceLabels[idx] || `Lựa chọn #${cid}`;
    const desc = opt.description || '';
    const imgUrl = opt.image_url || '';
    const initial = esc(label.charAt(0).toUpperCase());

    return `
      <div class="flex items-center gap-space-md bg-surface-container-lowest p-space-sm rounded-xl border border-surface-container-high/60">
        <div class="relative shrink-0">
          ${imgUrl ? `
            <img class="w-14 h-14 rounded-full object-cover shadow-sm bg-surface-container border border-surface-container-high/60" src="${esc(imgUrl)}" alt="${esc(label)}" onerror="this.onerror=null; this.src=''; this.parentElement.innerHTML='<div class=\\'w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-xl\\'>${initial}</div>';">
          ` : `
            <div class="w-14 h-14 rounded-full bg-surface-container-high flex items-center justify-center text-primary font-bold text-xl shadow-sm">
              ${initial}
            </div>
          `}
        </div>
        <div class="flex flex-col flex-1 min-w-0">
          <div class="flex items-center gap-1.5">
            <span class="font-headline-sm text-headline-sm text-on-surface font-bold truncate">${esc(label)}</span>
            <span class="material-symbols-outlined text-primary text-[18px]">verified</span>
          </div>
          ${desc ? `<span class="font-body-sm text-body-sm text-on-surface-variant truncate">${esc(desc)}</span>` : ''}
          <div class="flex items-center gap-2 mt-1">
            <span class="font-label-tag text-label-tag px-2 py-0.5 rounded-full bg-on-tertiary-container text-tertiary font-bold">
              Lựa chọn hợp lệ #${String(idx + 1).padStart(2, '0')}
            </span>
          </div>
        </div>
        <div class="flex flex-col items-end pr-space-xs shrink-0">
          <div class="w-10 h-10 rounded-full bg-tertiary-container text-on-tertiary flex items-center justify-center shadow-sm">
            <span class="material-symbols-outlined text-[24px]">check</span>
          </div>
        </div>
      </div>
    `;
  }

  // 3. Render Thẻ Biên Lai Xác Minh Hoàn Chỉnh (Material 3 Inspection Card)
  function renderReceiptCard(d, choicesHtml, explorerUrl) {
    return `
      <div class="w-full bg-surface-container-lowest rounded-2xl shadow-xl overflow-hidden flex flex-col border border-surface-container-high/80 animate-[slideIn_0.3s_ease-out]">
        <!-- Header Thanh trạng thái xác nhận -->
        <div class="bg-gradient-to-r from-surface-container-high via-surface-container to-surface-container-high px-space-lg py-space-md flex flex-wrap items-center justify-between gap-space-md border-b border-surface-container-high">
          <div class="flex items-center gap-space-md">
            <div class="w-12 h-12 rounded-2xl bg-tertiary-container text-on-tertiary flex items-center justify-center shadow-md shrink-0">
              <span class="material-symbols-outlined text-[30px]" style="font-variation-settings: 'FILL' 1;">check_circle</span>
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-space-xs">
                <span class="font-headline-md text-headline-md text-on-surface font-bold">Phiếu Hợp Lệ &amp; Đã Ghi Nhận</span>
                <span class="px-2.5 py-0.5 rounded-full bg-on-tertiary-container text-tertiary font-label-tag text-label-tag font-bold uppercase tracking-wider">Đã xác thực</span>
              </div>
              <span class="font-body-sm text-body-sm text-on-surface-variant">Lá phiếu đã được ghi nhận trên sổ cái Sepolia và có giá trị kiểm toán vĩnh viễn.</span>
            </div>
          </div>

          <!-- Nút tải biên lai & in phiếu -->
          <div class="flex items-center gap-space-xs no-print">
            <button id="btnDownload" type="button" class="px-space-md py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-headline-sm text-body-sm font-semibold flex items-center gap-1.5 shadow-sm border border-surface-container-high transition-colors cursor-pointer" title="Tải về máy file biên lai xác thực">
              <span class="material-symbols-outlined text-[18px]">download</span>
              <span>Tải biên lai</span>
            </button>
            <button id="btnPrint" type="button" class="px-space-md py-2 rounded-xl bg-surface-container-lowest hover:bg-surface-container-low text-on-surface font-headline-sm text-body-sm font-semibold flex items-center gap-1.5 shadow-sm border border-surface-container-high transition-colors cursor-pointer" title="In phiếu bầu">
              <span class="material-symbols-outlined text-[18px]">print</span>
              <span>In phiếu</span>
            </button>
          </div>
        </div>

        <!-- Thân biên lai -->
        <div class="p-space-lg flex flex-col gap-space-md">
          <!-- Hàng 1: Cuộc bầu cử & Thời gian khối -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs border border-surface-container-high/60">
              <span class="font-body-sm text-body-sm text-on-surface-variant uppercase tracking-wider font-semibold">Cuộc bầu cử</span>
              <div class="flex items-center gap-space-xs">
                <a href="/election/${esc(d.election.address)}/" class="font-headline-sm text-headline-sm text-primary font-bold hover:underline">
                  ${esc(d.election.name)}
                </a>
              </div>
              <span class="font-label-code text-body-sm text-on-surface-variant">
                Contract: ${App.short(d.election.address)}
              </span>
            </div>

            <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col gap-space-xs justify-center border border-surface-container-high/60">
              <div class="flex items-center justify-between">
                <span class="font-body-sm text-body-sm text-on-surface-variant uppercase tracking-wider font-semibold">Thời gian ghi nhận</span>
                <span class="font-label-tag text-label-tag text-tertiary font-bold flex items-center gap-1">
                  <span class="material-symbols-outlined text-[14px]">task_alt</span>
                  Khối #${esc(d.block)}
                </span>
              </div>
              <span class="font-headline-sm text-headline-sm text-on-surface font-bold">
                ${esc(App.fmtDate(d.time))}
              </span>
              <span class="font-body-sm text-body-sm text-on-surface-variant">Múi giờ địa phương (GMT+7)</span>
            </div>
          </div>

          <!-- Hàng 2: Lựa chọn đã bỏ phiếu -->
          <div class="p-space-md rounded-xl bg-surface-container-high flex flex-col gap-space-xs shadow-xs border border-surface-container-highest">
            <span class="font-body-sm text-body-sm text-on-surface-variant font-bold">Lựa chọn bạn đã bỏ phiếu:</span>
            <div class="flex flex-col gap-2">
              ${choicesHtml}
            </div>
          </div>

          <!-- Hàng 3: Cử tri đã bỏ phiếu -->
          <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs border border-surface-container-high/60">
            <div class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-outline text-[18px] shrink-0">account_balance_wallet</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant shrink-0">Ví cử tri:</span>
              <span class="font-label-code text-label-code text-on-surface font-bold truncate">${esc(d.voter)}</span>
            </div>
            <a href="${explorerUrl}/address/${esc(d.voter)}" target="_blank" rel="noopener" class="font-body-sm text-body-sm text-primary hover:underline flex items-center gap-1 font-medium shrink-0">
              <span>Xem lịch sử ví</span>
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>

          <!-- Hàng 4: Mã định danh giao dịch (TxHash) -->
          <div class="p-space-md rounded-xl bg-surface-container-low flex flex-col sm:flex-row sm:items-center justify-between gap-space-xs border border-surface-container-high/60">
            <div class="flex items-center gap-2 min-w-0">
              <span class="material-symbols-outlined text-outline text-[18px] shrink-0">fingerprint</span>
              <span class="font-body-sm text-body-sm text-on-surface-variant shrink-0">Mã định danh giao dịch:</span>
              <span class="font-label-code text-label-code text-primary font-bold truncate">${esc(d.tx_hash)}</span>
            </div>
            <div class="flex items-center gap-space-xs shrink-0">
              <a href="${explorerUrl}/tx/${esc(d.tx_hash)}" target="_blank" rel="noopener" class="font-body-sm text-body-sm text-primary hover:underline flex items-center gap-1 font-bold">
                <span class="material-symbols-outlined text-[16px]">open_in_new</span>
                <span>Xem chi tiết sổ cái (Sepolia)</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // 4. Tải file JSON biên lai xác thực
  function downloadReceiptJson(d) {
    const receiptData = {
      protocol: 'VoteChain Protocol EIP-712',
      status: 'VERIFIED_ON_CHAIN',
      network: 'Ethereum Sepolia Testnet (Chain ID 11155111)',
      tx_hash: d.tx_hash,
      block_number: d.block,
      timestamp: d.time,
      election: d.election,
      voter_address: d.voter,
      choices: d.choices,
      choice_labels: d.choice_labels,
      verified_at: new Date().toISOString(),
      verification_url: `${window.location.origin}/verify/?tx=${d.tx_hash}`
    };

    const blob = new Blob([JSON.stringify(receiptData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `VoteChain_Receipt_${d.tx_hash.slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    App.toast('Đã tải tệp biên lai xác thực về máy!', 'ok', 3000);
  }

  // 5. Render các thông báo trạng thái phụ (pending_index, failed, not_vote, not_found)
  function renderStatusNotice(status, d, rawTx, explorerUrl) {
    if (status === 'pending_index') {
      return `
        <div class="bg-amber-50 border-l-4 border-amber-500 p-space-lg rounded-2xl shadow-sm text-amber-900 flex items-start gap-space-md border border-amber-200">
          <span class="material-symbols-outlined text-amber-600 text-[36px] shrink-0">pending_actions</span>
          <div class="flex flex-col gap-1">
            <b class="font-headline-sm text-headline-sm text-amber-800">Đang chờ hệ thống ghi sổ chỉ mục (Pending Indexer)</b>
            <p class="font-body-md leading-relaxed">
              Giao dịch đã xác nhận thành công trên chuỗi Sepolia tại khối <b>#${esc(d.block)}</b> cho hòm phiếu 
              <a href="/election/${esc(d.election.address)}/" class="font-bold underline text-primary">${esc(d.election.name)}</a>. 
              Dữ liệu vừa được ghi và máy chủ đang đồng bộ bản đọc nhanh.
            </p>
            <div class="pt-2">
              <button onclick="location.reload()" class="px-space-md py-1.5 rounded-xl bg-amber-600 text-white font-headline-sm text-body-sm font-bold hover:bg-amber-700 transition-all cursor-pointer inline-flex items-center gap-1">
                <span class="material-symbols-outlined text-[16px]">refresh</span>
                Tải lại kết quả sau 5 giây
              </button>
            </div>
          </div>
        </div>
      `;
    }
    if (status === 'failed') {
      return `
        <div class="bg-red-50 border-l-4 border-error p-space-lg rounded-2xl shadow-sm text-error flex items-start gap-space-md border border-red-200">
          <span class="material-symbols-outlined text-error text-[36px] shrink-0">cancel</span>
          <div class="flex flex-col gap-1">
            <b class="font-headline-sm text-headline-sm">Giao dịch đã thất bại (EVM Reverted)</b>
            <p class="font-body-md text-on-surface-variant leading-relaxed">
              Giao dịch này đã được đào lên chuỗi nhưng bị máy ảo EVM hoàn tác (Reverted). Phiếu bầu này <b>KHÔNG</b> được tính vào kết quả cuộc bầu cử.
            </p>
            <a href="${explorerUrl}/tx/${esc(rawTx)}" target="_blank" rel="noopener" class="text-primary font-bold text-body-sm hover:underline flex items-center gap-1 mt-1">
              <span>Kiểm tra lỗi trên Etherscan</span>
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>
        </div>
      `;
    }
    if (status === 'not_vote') {
      return `
        <div class="bg-surface-container-low border-l-4 border-outline p-space-lg rounded-2xl shadow-sm text-on-surface flex items-start gap-space-md border border-surface-container-high">
          <span class="material-symbols-outlined text-outline text-[36px] shrink-0">info</span>
          <div class="flex flex-col gap-1">
            <b class="font-headline-sm text-headline-sm">Giao dịch không phải phiếu bầu VoteChain</b>
            <p class="font-body-md text-on-surface-variant leading-relaxed">
              Giao dịch này có tồn tại trên mạng Sepolia nhưng không phát sinh sự kiện bỏ phiếu (<code>VoteCast</code>) của các hợp đồng thuộc hệ thống VoteChain.
            </p>
            <a href="${explorerUrl}/tx/${esc(rawTx)}" target="_blank" rel="noopener" class="text-primary font-bold text-body-sm hover:underline flex items-center gap-1 mt-1">
              <span>Tra cứu giao dịch trên Etherscan</span>
              <span class="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>
        </div>
      `;
    }
    return `
      <div class="bg-red-50 border-l-4 border-error p-space-lg rounded-2xl shadow-sm text-error flex items-start gap-space-md border border-red-200">
        <span class="material-symbols-outlined text-error text-[36px] shrink-0">search_off</span>
        <div class="flex flex-col gap-1">
          <b class="font-headline-sm text-headline-sm">Không tìm thấy mã giao dịch này</b>
          <p class="font-body-md text-on-surface-variant leading-relaxed">
            Không tìm thấy giao dịch <code>${esc(rawTx)}</code> trên mạng Sepolia hoặc trong cơ sở dữ liệu. Nếu bạn vừa gửi giao dịch, vui lòng đợi khoảng 15-30 giây để thợ đào đóng gói vào khối rồi thử lại.
          </p>
        </div>
      </div>
    `;
  }

  // 6. Logic Tra Cứu & Xác Minh Phiếu Bầu
  async function verify() {
    const rawTx = $('tx').value.trim();
    if (!rawTx) {
      App.toast('Vui lòng nhập hoặc dán mã giao dịch (TxHash).', 'warn');
      $('tx').focus();
      return;
    }

    $('btnVerify').disabled = true;
    const originalBtn = $('btnVerify').innerHTML;
    $('btnVerify').innerHTML = `
      <span class="material-symbols-outlined text-[20px] animate-spin">progress_activity</span>
      <span>Đang truy vấn...</span>
    `;

    show(`
      <div class="bg-surface-container-lowest rounded-2xl shadow-sm p-12 text-center border border-surface-container-high/60 flex flex-col items-center justify-center gap-3">
        <span class="material-symbols-outlined text-primary text-[42px] animate-spin">progress_activity</span>
        <h3 class="font-headline-md text-headline-md text-on-surface font-bold">Đang tra cứu sổ cái Sepolia...</h3>
        <p class="font-body-md text-on-surface-variant max-w-md">
          Hệ thống đang truy vấn trạng thái biên lai giao dịch từ node Ethereum và đối soát chữ ký Merkle Tree.
        </p>
      </div>
    `);

    try {
      const d = await App.api('/api/verify/?tx=' + encodeURIComponent(rawTx));
      const explorerUrl = App.cfg.explorer_url || 'https://sepolia.etherscan.io';

      if (d.status === 'confirmed') {
        let optionsMap = {};
        try {
          const electDetail = await App.api(`/api/elections/${d.election.address}/`);
          if (electDetail && electDetail.options) {
            electDetail.options.forEach((opt) => { optionsMap[opt.id] = opt; });
          }
        } catch (_) { }

        const choicesHtml = d.choices.map((cid, idx) => renderChoiceItem(cid, idx, optionsMap, d.choice_labels)).join('');
        show(renderReceiptCard(d, choicesHtml, explorerUrl));

        if ($('btnPrint')) $('btnPrint').addEventListener('click', () => window.print());
        if ($('btnDownload')) $('btnDownload').addEventListener('click', () => downloadReceiptJson(d));
      } else {
        show(renderStatusNotice(d.status, d, rawTx, explorerUrl));
      }
    } catch (e) {
      show(`
        <div class="bg-red-50 border-l-4 border-error p-space-lg rounded-2xl shadow-sm text-error flex items-center gap-space-md border border-red-200">
          <span class="material-symbols-outlined text-error text-[36px] shrink-0">warning</span>
          <div class="flex flex-col gap-1">
            <b class="font-headline-sm text-headline-sm">Lỗi xử lý yêu cầu</b>
            <span class="font-body-md text-on-surface-variant">${esc(e.message)}</span>
          </div>
        </div>
      `);
    }

    $('btnVerify').disabled = false;
    $('btnVerify').innerHTML = originalBtn;
  }

  // 7. Gắn sự kiện các nút tiện ích (Paste, Sample, Scan)
  if ($('btnPaste')) {
    $('btnPaste').addEventListener('click', async () => {
      try {
        if (navigator.clipboard && navigator.clipboard.readText) {
          const text = await navigator.clipboard.readText();
          if (text) {
            $('tx').value = text.trim();
            $('tx').focus();
            App.toast('Đã dán mã giao dịch từ bộ nhớ đệm!', 'ok', 2000);
          }
        } else {
          $('tx').focus();
          $('tx').select();
        }
      } catch (_) {
        $('tx').focus();
        $('tx').select();
      }
    });
  }

  if ($('btnSample')) {
    $('btnSample').addEventListener('click', async () => {
      try {
        const res = await App.api('/api/elections/?page_size=10');
        let foundTx = null;
        if (res && res.elections) {
          for (const el of res.elections) {
            if (el.total_voters > 0) {
              const vRes = await App.api(`/api/elections/${el.address}/voters/?page_size=1`);
              if (vRes && vRes.votes && vRes.votes.length) {
                foundTx = vRes.votes[0].tx_hash;
                break;
              }
            }
          }
        }
        $('tx').value = foundTx || '0x9a8f4cd73e8241ea8971b2e10a28f80459c004bf239f1cde875249a602bd71b2';
        $('tx').focus();
        verify();
      } catch (_) {
        $('tx').value = '0x9a8f4cd73e8241ea8971b2e10a28f80459c004bf239f1cde875249a602bd71b2';
        verify();
      }
    });
  }

  if ($('btnScanQR')) {
    $('btnScanQR').addEventListener('click', () => {
      App.toast('Chức năng Quét camera QR đang được đồng bộ với phiên bản Mobile app.', 'info');
    });
  }

  $('btnVerify').addEventListener('click', verify);
  $('tx').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') verify();
  });

  const pre = new URLSearchParams(location.search).get('tx');
  if (pre) {
    $('tx').value = pre;
    verify();
  }
})();
