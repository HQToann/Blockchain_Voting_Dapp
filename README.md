# TỔNG QUAN TOÀN DIỆN DỰ ÁN BLOCKCHAIN DECENTRALIZED VOTING DAPP

Chào mừng bạn đến với tài liệu kỹ thuật tổng quan của dự án **Decentralized Voting DApp (Hòm Phiếu Cộng Đồng Phi Tập Trung)**. Tài liệu này cung cấp một cái nhìn sâu sắc, chi tiết từng thành phần từ tầng Smart Contract, Backend Server, Cơ chế Lắng nghe dữ liệu (Indexer/Chain Watcher) cho đến Giao diện Người dùng (Frontend).

---

## 1. TỔNG QUAN DỰ ÁN & TRIẾT LÝ THIẾT KẾ

Dự án là một **Nền tảng Hòm phiếu Cộng đồng Phi tập trung (Decentralized Voting Platform)**, cho phép bất kỳ người dùng nào sở hữu ví Web3 (như MetaMask) đều có thể tự tạo hòm phiếu, thiết lập luật lệ, cấp quyền cử tri và tiến hành bỏ phiếu hoàn toàn minh bạch trên blockchain.

### Triết lý cốt lõi:
1. **Blockchain là Nguồn Sự Thật Duy Nhất (Single Source of Truth):**
   - Toàn bộ luật bỏ phiếu, danh sách ứng cử viên/lựa chọn, quyền whitelist, thời gian hiệu lực và từng lá phiếu đều được thực thi và lưu trữ bất biến trên Blockchain.
   - **Backend KHÔNG lưu trữ private key** và **KHÔNG ký thay bất kỳ giao dịch nào**. Mọi hành động ghi dữ liệu on-chain (tạo hòm phiếu, vote, thêm whitelist, đổi lịch, đóng sớm) đều do chính ví của người dùng ký và trả phí gas.
2. **Database là Read-Model / Cache đọc nhanh:**
   - Cơ sở dữ liệu quan hệ (PostgreSQL / SQLite) đóng vai trò là bản sao đọc (Read-Replica). Một tiến trình Indexer chạy nền liên tục bắt các sự kiện (Events/Logs) từ blockchain để đồng bộ vào database, giúp việc truy vấn, lọc, phân trang và tìm kiếm trên Web diễn ra tức thì mà không phải gọi RPC liên tục.
3. **Lưu trữ Off-chain phi tập trung (IPFS Pinata):**
   - Hình ảnh ứng viên và mô tả chi tiết được ghim lên mạng lưới IPFS qua Pinata. Chỉ có chuỗi mã băm CID (Content Identifier) được lưu trữ trên Blockchain và Database, giúp tối ưu chi phí gas lưu trữ.

---

## 2. KIẾN TRÚC HỆ THỐNG TỔNG THỂ

Hệ thống kết hợp hài hòa giữa **Web3 (Decentralized)** và **Web2 (High Performance & Realtime)**:

```
                        ┌───────────────────────────────────────────┐
                        │           Blockchain (Sepolia)            │
                        │      ElectionFactory / Election.sol       │
                        └─────────────▲─────────────────┬───────────┘
                                      │                 │
              Ký giao dịch trực tiếp  │                 │ Phát Event Logs
            (Create, Vote, Whitelist) │                 │ (WebSocket / RPC)
                                      │                 ▼
┌─────────────────────────┐           │     ┌───────────────────────────┐
│     Client Frontend     ├───────────┘     │    Indexer / Watcher      │
│ (Templates + Ethers.js) │                 │   (chain_watcher.py)      │
└────────────▲────────────┘                 └───────────┬───────────────┘
             │                                          │ Ghi nhận DB & Reconcile
   WebSocket │ Push Realtime                            ▼
┌────────────┴────────────┐                 ┌───────────────────────────┐
│     Django Backend      │◄────────────────┤    Database & Redis       │
│  (Daphne ASGI Server)   │                 │  (PostgreSQL/SQLite DB)   │
└─────────────────────────┘                 └───────────────────────────┘
```

---

## 3. CHI TIẾT 4 TRỤ CỘT KỸ THUẬT

### 3.1. BLOCKCHAIN (Solidity & Hardhat)
- **Vị trí mã nguồn:** `blockchain/contracts/VotingSystem.sol`
- **Môi trường phát triển:** Hardhat, Hardhat Ignition, Solidity `^0.8.20` (Trình biên dịch bật Optimizer 200 runs).

Hệ thống hợp đồng thông minh sử dụng **Factory Pattern** gồm 2 hợp đồng chính:

#### A. Contract `ElectionFactory`
- **Nhiệm vụ:** Đóng vai trò "nhà máy" sinh hòm phiếu.
- **Hàm `createElection(ElectionParams memory p)`:** 
  - Khởi tạo một phiên bản hợp đồng con `new Election(msg.sender, p)`.
  - Lưu địa chỉ hòm phiếu con vào mảng `_elections`.
  - Phát sự kiện `ElectionCreated(...)` chứa toàn bộ thông số ban đầu.
- **Hàm hỗ trợ đọc:** `electionsCount()`, `electionAt(index)`, `getElections(offset, limit)` hỗ trợ phân trang danh sách địa chỉ hòm phiếu.

#### B. Contract `Election`
- **Nhiệm vụ:** Quản lý quy trình của một hòm phiếu duy nhất. Người gọi Factory trở thành `owner` (chủ sở hữu) của hợp đồng này.
- **Struct `ElectionParams`:**
  - `name`: Tên hòm phiếu / câu hỏi (tối đa 200 bytes).
  - `metadataURI`: CID IPFS chứa ảnh và mô tả mở rộng.
  - `kind`: `0 = Candidates` (Bầu cử ứng viên), `1 = Proposal` (Biểu quyết một vấn đề).
  - `isPrivate`: `true` = Chỉ ví nằm trong Whitelist mới được quyền bỏ phiếu.
  - `maxChoices`: Số lượng lựa chọn tối đa mỗi cử tri được phép tích chọn trong 1 phiếu ($1 \le \text{maxChoices} \le \text{options.length}$).
  - `startTime`, `endTime`: Unix timestamp bắt đầu và kết thúc (0 = mở ngay hoặc không hẹn giờ).
  - `options`: Mảng tên các lựa chọn (từ 2 đến 50 lựa chọn, độ dài mỗi lựa chọn tối đa 100 bytes, không được trùng tên).
- **Hệ thống trạng thái (`status()`):**
  - `Upcoming`: Chưa tới thời gian `startTime`.
  - `Open`: Đang trong thời gian bỏ phiếu và chưa bị đóng.
  - `Ended`: Đã quá thời gian `endTime`.
  - `ClosedByOwner`: Đã bị chủ hòm phiếu chủ động đóng sớm.
- **Hàm nghiệp vụ chính:**
  - `vote(uint256[] calldata choices)`: Kiểm tra trạng thái `Open`, cử tri chưa từng vote (`!hasVoted[msg.sender]`), kiểm tra whitelist nếu là hòm phiếu riêng tư. Validate số lượng lựa chọn $[1, \text{maxChoices}]$, không cho phép chọn trùng đáp án. Tăng số phiếu trong `voteCounts`, tăng `totalVoters` và phát sự kiện `VoteCast(msg.sender, choices)`.
  - `addToWhitelist(address[] calldata voters)`: Thêm danh sách ví cử tri (tối đa 200 ví/lần, chỉ áp dụng cho hòm phiếu riêng tư và chỉ khi hòm phiếu chưa kết thúc).
  - `removeFromWhitelist(address[] calldata voters)`: Xóa ví cử tri khỏi whitelist, **chỉ cho phép gỡ khi cử tri đó CHƯA bỏ phiếu**.
  - `closeEarly()`: Chủ hòm phiếu đóng hòm phiếu ngay lập tức (không thể mở lại).
  - `reschedule(newStart, newEnd)`: Chỉ cho phép dời lịch khi hòm phiếu **chưa bắt đầu**.

#### C. Quy trình xuất ABI tự động (`scripts/export_abi.js`)
- Trích xuất ABI từ artifacts sau khi biên dịch ra `Election_ABI.json`, `Factory_ABI.json` (dùng cho Python Backend & Indexer) và `static/js/abi.js` (dùng cho Frontend trình duyệt). Đảm bảo 100% không bao giờ bị lệch chuẩn giữa Blockchain và Ứng dụng Web.

---

### 3.2. BACKEND (Django 5, Channels, Redis & Pinata IPFS)
- **Vị trí mã nguồn:** Thư mục `core/` và `election/`.
- **Máy chủ ứng dụng:** Chạy ASGI bằng **Daphne**, hỗ trợ đồng thời giao thức HTTP thông thường và kết nối WebSocket bền vững.

#### A. Mô hình dữ liệu Database (`election/models.py`)
- **`Election`:** Bản sao metadata và trạng thái hòm phiếu (`contract_addr`, `owner_address`, `name`, `description`, `kind`, `is_private`, `max_choices`, `start_time`, `end_time`, `closed_by_owner`, `total_voters`, `is_hidden`).
- **`Option`:** Lưu từng lựa chọn (`election`, `option_id`, `label`, `description`, `image_cid`, `vote_count`). Ràng buộc duy nhất `UniqueConstraint(election, option_id)`.
- **`VoteRecord`:** Ghi nhận từng lá phiếu on-chain (`election`, `voter_address`, `choices`, `tx_hash`, `block_number`). Ràng buộc `UniqueConstraint(election, voter_address)`.
- **`WhitelistEntry`:** Danh sách ví cử tri được cấp quyền trong hòm phiếu riêng tư.
- **`MetadataBlob`:** Lưu bộ nhớ đệm JSON metadata khi ghim lên IPFS.
- **`SystemLog`:** Ghi log hệ thống (Blockchain, Indexer, IPFS, Auth), tự động giữ tối đa 1.000 bản ghi mới nhất.
- **`IndexerState`:** Lưu trạng thái đồng bộ (`key='main'`, `last_block`, `updated_at`).

#### B. Hệ thống API & Dịch vụ (`election/views.py`)
1. **Xác thực ví không tốn gas (SIWE-like Signature):**
   - Client gọi `/api/auth/nonce/` lấy một chuỗi nonce ngẫu nhiên (hạn 300s).
   - Người dùng ký chuỗi thông điệp đăng nhập bằng ví MetaMask.
   - Gửi chữ ký lên `/api/auth/verify/`. Backend dùng `Account.recover_message` giải mã chữ ký. Nếu hợp lệ, lưu địa chỉ ví vào `request.session['wallet']`. Chữ ký này **chỉ dùng để xác thực quyền tải ảnh/metadata lên IPFS**, không can thiệp vào ví người dùng.
2. **Dịch vụ IPFS Pinata (`election/services.py`):**
   - API `/api/ipfs/image/`: Tải ảnh ứng cử viên. Kiểm tra magic bytes qua hàm `sniff_image_type` (chỉ chấp nhận PNG, JPEG, GIF, WEBP; cố ý **chặn SVG** để triệt tiêu nguy cơ tấn công Stored XSS).
   - API `/api/ipfs/metadata/`: Chuẩn hóa JSON metadata (mô tả, danh sách ảnh/mô tả từng lựa chọn) và ghim lên Pinata IPFS.
3. **API Truy vấn chỉ-đọc:**
   - `/api/config/`: Cung cấp Chain ID, RPC public, địa chỉ Factory, Explorer URL và các cấu hình giới hạn.
   - `/api/elections/`: Phân trang, tìm kiếm và lọc hòm phiếu theo trạng thái (`open`, `upcoming`, `ended`, `closed`), theo loại hòm phiếu, theo người tạo hoặc theo ví đã vote.
   - `/api/elections/<addr>/`: Chi tiết hòm phiếu, số phiếu và % tỷ lệ cử tri cho từng phương án.
   - `/api/verify/`: Tra cứu mã giao dịch (`tx_hash`). Nếu đã có trong DB, trả về phiếu bầu hợp lệ; nếu chưa có trong DB, tự động truy vấn trực tiếp node RPC qua `w3.eth.get_transaction_receipt` để xác minh trạng thái giao dịch trên chain.
4. **Bảo mật & Giới hạn tần suất (`election/security.py`):**
   - Lấy IP thật của client dựa trên cấu hình proxy `TRUSTED_PROXY_COUNT` (chống giả mạo `X-Forwarded-For`).
   - Giới hạn tần suất nguyên tử bằng cache Redis (`cache.add` + `cache.incr`).

#### C. Bảng điều khiển Quản trị (`election/admin.py`)
- Quản trị viên hệ thống (Superuser) đăng nhập vào `/admin/`.
- Mọi dữ liệu liên quan đến blockchain (Hòm phiếu, Phiếu bầu, Whitelist) đều là **chỉ-đọc (ReadOnlyAdmin)**.
- Quản trị viên chỉ có duy nhất quyền tích chọn cờ `is_hidden` để ẩn các hòm phiếu rác hoặc vi phạm nội dung khỏi trang chủ mà **hoàn toàn không thể sửa đổi số phiếu hay can thiệp vào hợp đồng trên blockchain**.

---

### 3.3. INDEXER / CHAIN WATCHER (Đồng bộ, Catch-up & Tự phục hồi)
- **Vị trí mã nguồn:** `election/indexer_core.py` và `indexer/chain_watcher.py`.
- **Cơ chế hoạt động:** Chạy như một tiến trình ngầm (daemon) liên tục 24/7.

```
[WebSocket Node] ────► [chain_watcher.py] ────► [indexer_core.py]
                             │                          │
                      LogsSubscription            process_log()
                             │                          │
                             ▼                          ▼
                     [Async Event Loop] ──────► [Django DB & Redis]
                                                        │
                                                        ▼
                                                publish() WebSocket
                                                        │
                                                        ▼
                                                Trình duyệt Cử tri
```

#### A. Kiến trúc xử lý hai tầng:
1. **Tầng Bất đồng bộ (`chain_watcher.py`):**
   - Mở kết nối WebSocket tới node Ethereum qua `AsyncWeb3` và `WebSocketProvider`.
   - Đăng ký `LogsSubscription` theo dõi Factory và tất cả các hòm phiếu đang hoạt động (chia chunk 50 địa chỉ/subscription để tránh quá tải giới hạn của nhà cung cấp node).
   - Tự động kết nối lại (Exponential Backoff) nếu mạng gặp sự cố.
2. **Tầng Lõi đồng bộ (`election/indexer_core.py`):**
   - Nhận log từ watcher và giải mã bằng `get_event_data`.
   - **Xác thực tính hợp lệ của nguồn phát:** Log `ElectionCreated` chỉ được chấp nhận nếu phát ra từ đúng `FACTORY_ADDRESS`; Log của hòm phiếu con chỉ được chấp nhận nếu địa chỉ contract đó đã được hệ thống ghi nhận. Loại bỏ hoàn toàn các event giả mạo.

#### B. Tính năng tự phục hồi (Self-Healing & Reconcile):
- **Catch-up (Quét bù):** Khi khởi động hoặc sau khi mất mạng, tiến trình tự động quét bù các block từ `last_block` đến block mới nhất (`head`) theo từng đoạn `GETLOGS_BLOCK_RANGE` (phân đoạn nhỏ tránh bị dính lỗi Rate Limit 429 từ RPC).
- **Đối soát định kỳ (`reconcile_election`):** Định kỳ mỗi 5 phút hoặc khi gặp sự kiện Block Reorg (`log.get('removed') == True`), Indexer sẽ gọi trực tiếp các hàm view trên smart contract (`startTime`, `endTime`, `closedByOwner`, `totalVoters`).
  - Nếu DB thiếu phiếu: Tự động quét lại toàn bộ logs của contract đó.
  - Nếu DB thừa phiếu (do nhánh chuỗi bị reorg): Tự động gọi `rebuild_election()` xóa các bản ghi phiếu cũ trong DB và dựng lại từ đầu theo đúng chuỗi canonical mới nhất.
- **Nhịp tim (Heartbeat):** Ghi nhận timestamp hoạt động vào `IndexerState`. API `/api/health/` dựa vào đây để cảnh báo cho người dùng trên giao diện nếu watcher bị chậm hoặc mất kết nối.

---

### 3.4. FRONTEND (Giao diện Web3 & Realtime)
- **Vị trí mã nguồn:** Thư mục `templates/` (HTML) và `static/` (CSS, JS).
- **Công nghệ:** HTML5, Vanilla JavaScript, Vanilla CSS hiện đại, Ethers.js v6 (được nhúng file cục bộ `static/vendor/ethers.umd.min.js`, không phụ thuộc CDN bên ngoài hay build tool nặng nề).

#### A. Các mô-đun Javascript cốt lõi:
1. **[`static/js/common.js`](file:///d:/BlockChain%20Dapp/Blockchain_Project/static/js/common.js):**
   - Quản lý trạng thái ví MetaMask (`App.state.provider`, `App.state.signer`, `App.state.address`).
   - Tự động chuyển mạng hoặc thêm mạng (`App.ensureChain` qua `wallet_switchEthereumChain` / `wallet_addEthereumChain`).
   - Quản lý giao dịch (`App.tx`): Bắt các mã lỗi revert từ smart contract và thông báo dạng Toast thân thiện (ví dụ: thiếu tiền gas, từ chối ký, quá số lượng lựa chọn).
   - Mở kết nối WebSocket (`App.watch`): Lắng nghe tín hiệu cập nhật theo phòng (`election_all` hoặc `election_<address>`), tự động reconnect sau 3 giây.
2. **[`static/js/create.js`](file:///d:/BlockChain%20Dapp/Blockchain_Project/static/js/create.js):**
   - Form tạo hòm phiếu động: thêm/xóa ứng viên, tải ảnh xem trước trực quan.
   - Hỗ trợ tạo nhanh mẫu biểu quyết (Đồng ý / Không đồng ý / Phiếu trắng).
   - Modal hiển thị tiến trình từng bước: Đăng nhập ví $\rightarrow$ Tải ảnh lên IPFS $\rightarrow$ Ghim metadata $\rightarrow$ Ký giao dịch trên MetaMask $\rightarrow$ Chờ blockchain xác nhận $\rightarrow$ Chuyển hướng đến hòm phiếu mới.
3. **[`static/js/detail.js`](file:///d:/BlockChain%20Dapp/Blockchain_Project/static/js/detail.js):**
   - **Đọc trực tiếp từ blockchain:** Dùng Ethers.js gọi `c.hasVoted(me)` và `c.whitelist(me)` trực tiếp từ contract để xác định chính xác quyền của người dùng hiện tại ngay cả khi backend chưa kịp index.
   - **Optimistic UI:** Khi cử tri bấm bỏ phiếu và giao dịch được xác nhận, giao diện lập tức cộng số phiếu tạm thời trên màn hình để cử tri thấy kết quả nhảy số ngay lập tức.
   - **Bảng điều khiển của Chủ hòm phiếu (Owner Panel):** Nếu ví hiện tại trùng với `owner`, giao diện sẽ mở ra các công cụ quản trị:
     - Nhập hàng loạt địa chỉ ví để thêm vào Whitelist (tự động chia lô 100 ví/giao dịch).
     - Gỡ ví khỏi Whitelist (chỉ gỡ được ví chưa vote).
     - Dời lịch bắt đầu / kết thúc (khi hòm phiếu chưa mở).
     - Đóng hòm phiếu khẩn cấp.
   - **Realtime đa tầng:** Vừa lắng nghe sự kiện đẩy về từ Django WebSocket, vừa gắn listener `c.on("VoteCast")` trên provider trình duyệt để phát hiện phiếu bầu mới từ người khác.
4. **[`static/js/verify.js`](file:///d:/BlockChain%20Dapp/Blockchain_Project/static/js/verify.js):**
   - Cho phép tra cứu bất kỳ mã băm giao dịch (`tx_hash`) nào: hiển thị chi tiết tên hòm phiếu, địa chỉ cử tri, danh sách lựa chọn đã bầu, block number, thời gian ghi nhận và link kiểm chứng trên Etherscan.

---

## 4. HỆ THỐNG GIAO DIỆN (SITEMAP)

| URL Giao diện | Template HTML | Javascript xử lý | Chức năng chi tiết |
|---|---|---|---|
| `/` | `templates/index.html` | `static/js/index.js` | **Trang Chủ:** Tìm kiếm hòm phiếu theo tên/địa chỉ, lọc theo trạng thái (Đang mở, Sắp diễn ra, Đã kết thúc) hoặc loại hòm phiếu. Cập nhật danh sách realtime khi có hòm phiếu mới. |
| `/create/` | `templates/create.html` | `static/js/create.js` | **Tạo Hòm Phiếu:** Giao diện điền thông tin, chọn loại hòm phiếu, cài đặt quyền riêng tư/công khai, giới hạn số lựa chọn, hẹn giờ và upload ảnh/mô tả lên IPFS. |
| `/election/<address>/` | `templates/detail.html` | `static/js/detail.js` | **Chi Tiết & Bỏ Phiếu:** Xem kết quả tiến trình (thanh % realtime), tích chọn ứng viên và bỏ phiếu. Khu vực dành riêng cho chủ hòm phiếu (thêm Whitelist, Đóng sớm, Dời lịch). Tab danh sách cử tri đã vote và danh sách Whitelist. |
| `/my/` | `templates/my.html` | `static/js/my.js` | **Dashboard Cá Nhân:** Quản lý các hòm phiếu do ví hiện tại làm chủ (`owner`) hoặc theo dõi các hòm phiếu mà ví đã từng tham gia bỏ phiếu (`voted`). |
| `/verify/` | `templates/verify.html` | `static/js/verify.js` | **Kiểm Chứng Độc Lập:** Nhập Transaction Hash để truy xuất và xác minh bằng chứng lá phiếu từ cơ sở dữ liệu và node Blockchain. |
| `/admin/` | *(Giao diện Django)* | *(Jazzmin Admin)* | **Quản Trị Nền Tảng:** Dành cho người vận hành hệ thống kiểm duyệt nội dung (bật/tắt cờ ẩn hòm phiếu vi phạm), xem System Logs và theo dõi nhịp tim Indexer. |

---

## 5. CÁC LUỒNG HOẠT ĐỘNG THỰC TẾ (WORKFLOWS)

### 5.1. Luồng Tạo Hòm Phiếu Mới (Create Election)
1. Người dùng vào `/create/`, điền tên, chọn loại hòm phiếu, tải ảnh và nhập danh sách lựa chọn.
2. Trình duyệt gọi `/api/auth/nonce/` và yêu cầu ví MetaMask ký chuỗi đăng nhập (miễn phí gas).
3. Trình duyệt gửi ảnh lên `/api/ipfs/image/` và gửi metadata lên `/api/ipfs/metadata/` để nhận lại chuỗi CID từ mạng IPFS Pinata.
4. Ethers.js kích hoạt MetaMask gọi hàm `ElectionFactory.createElection(params)` kèm theo CID vừa nhận được.
5. Người dùng xác nhận giao dịch trên ví. Giao dịch thành công, contract `ElectionFactory` deploy một contract `Election` mới và phát sự kiện `ElectionCreated`.
6. Tiến trình `chain_watcher.py` bắt được sự kiện `ElectionCreated` $\rightarrow$ ghi nhận hòm phiếu và các ứng viên vào Database.
7. Trình duyệt tự động chuyển hướng người dùng đến trang chi tiết hòm phiếu `/election/<address>/?new=1`.

### 5.2. Luồng Bỏ Phiếu (Voting Flow)
1. Cử tri mở trang hòm phiếu `/election/<address>/`.
2. Trình duyệt gọi trực tiếp contract qua RPC để kiểm tra `hasVoted(me)` và `whitelist(me)`.
3. Cử tri tích chọn từ 1 đến `maxChoices` ứng viên và bấm **"Xác nhận gửi phiếu"**.
4. MetaMask bật lên yêu cầu cử tri ký giao dịch gọi hàm `Election.vote(choices)`.
5. Khi giao dịch được đưa vào block:
   - Giao diện người dùng áp dụng **Optimistic Update**: tự động cộng điểm ảo lên thanh kết quả ngay lập tức để người dùng không phải chờ đợi.
   - Smart contract phát sự kiện `VoteCast(voter, choices)`.
6. Tiến trình `chain_watcher.py` bắt được sự kiện `VoteCast` $\rightarrow$ ghi nhận vào bảng `VoteRecord`, cập nhật số phiếu trong `Option` và đẩy tin nhắn WebSocket qua Redis.
7. Màn hình của tất cả các cử tri khác đang mở trang này lập tức cập nhật số phiếu đồng bộ theo thời gian thực.

### 5.3. Luồng Quản Lý Whitelist (Dành cho Hòm phiếu Riêng tư)
1. Chủ hòm phiếu vào mục **"Quản lý cử tri"** trên trang chi tiết hòm phiếu của mình.
2. Dán danh sách các địa chỉ ví (phân cách bằng dấu phẩy, khoảng trắng hoặc xuống dòng).
3. Frontend tự động validate các địa chỉ hợp lệ và chia nhỏ danh sách thành từng lô (chunk) 100 ví.
4. Chủ hòm phiếu xác nhận trên ví MetaMask để gọi hàm `addToWhitelist(chunk)`.
5. Sau khi giao dịch hoàn tất, Indexer bắt sự kiện `VoterWhitelisted` và cập nhật danh sách vào bảng `WhitelistEntry`.

---

## 6. BẢNG CÔNG NGHỆ (TECH STACK)

| Hạng mục | Công nghệ / Thư viện | Vai trò trong hệ thống |
|---|---|---|
| **Smart Contracts** | Solidity `^0.8.20`, Hardhat | Xây dựng logic bầu cử, kiểm soát quyền truy cập và lưu trữ dữ liệu bất biến |
| **Blockchain Testing/Deploy** | Hardhat Ignition, Ethers.js, Chai | Kiểm thử logic hợp đồng và tự động hóa quy trình triển khai lên mạng thử nghiệm |
| **Web3 Client** | Ethers.js v6 (UMD) | Kết nối MetaMask, đọc dữ liệu on-chain, gửi giao dịch và chuyển mạng tự động |
| **Backend Framework** | Python 3, Django 5, Daphne ASGI | Quản lý logic nghiệp vụ, cung cấp REST API, phục vụ kết nối WebSocket |
| **Realtime Messaging** | Django Channels, Redis Pub/Sub | Kênh truyền thông tin thời gian thực giữa Backend và Trình duyệt |
| **Indexer / Watcher** | Python `web3.py` (AsyncWeb3, WebSocketProvider) | Tiến trình daemon lắng nghe sự kiện on-chain, quét bù (catch-up) và đối soát dữ liệu |
| **Cơ sở dữ liệu** | PostgreSQL 15 / SQLite3 | Read-model lưu trữ bộ nhớ đệm phục vụ tìm kiếm, phân trang và hiển thị nhanh |
| **Lưu trữ Off-chain** | IPFS (Pinata Cloud Gateway & API) | Lưu trữ hình ảnh ứng cử viên và tài liệu mô tả chi tiết phi tập trung |
| **Frontend UI** | Django Templates, Vanilla HTML5/CSS/JS | Giao diện Dark theme hiện đại, nhẹ nhàng, tối ưu tốc độ và không phụ thuộc build tool phức tạp |

---

## 7. HƯỚNG DẪN KHỞI CHẠY HỆ THỐNG

### Cách 1: Khởi chạy bằng Docker Compose (Khuyến nghị cho Production/Full-stack)
Toàn bộ hệ thống (PostgreSQL, Redis, Daphne Web Server, Chain Watcher) đã được cấu hình trọn vẹn trong file `docker-compose.yml`:

```bash
# 1. Tạo file cấu hình môi trường từ mẫu
cp .env.example .env

# 2. Điền các thông số RPC_URL, FACTORY_ADDRESS, PINATA_JWT vào file .env

# 3. Khởi chạy toàn bộ hệ thống
docker compose up -d --build

# 4. Kiểm tra logs hoạt động của các dịch vụ
docker compose logs -f
```

### Cách 2: Khởi chạy cục bộ trên môi trường Windows (Local Development)
Hệ thống có sẵn script `start_local.bat` hỗ trợ khởi động nhanh:

1. **Cài đặt môi trường:**
   ```bash
   npm install
   pip install -r requirements.txt
   ```
2. **Biên dịch Smart Contract & Đồng bộ ABI:**
   ```bash
   npx hardhat compile
   node scripts/export_abi.js
   ```
3. **Chạy Migrate Database:**
   ```bash
   python manage.py migrate
   python manage.py createsuperuser
   ```
4. **Khởi chạy ứng dụng:**
   - Chạy trực tiếp file `start_local.bat` hoặc khởi chạy 2 tiến trình độc lập trong 2 cửa sổ terminal:
     - **Terminal 1 (Web Server):** `daphne -b 127.0.0.1 -p 8000 core.asgi:application`
     - **Terminal 2 (Chain Watcher):** `python indexer/chain_watcher.py`
5. **Truy cập ứng dụng:**
   - Web Bầu Cử: `http://127.0.0.1:8000/`
   - Bảng Quản Trị Admin: `http://127.0.0.1:8000/admin/`
