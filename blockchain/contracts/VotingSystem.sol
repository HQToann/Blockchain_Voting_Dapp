// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Tham số tạo hòm phiếu. Dùng struct để 1 giao dịch duy nhất tạo xong toàn bộ.
/*
    structure: kiểu dữ liệu tự định nghĩa, cho phép gộp nhiều biến có các kiểu giá trị
    khác nhau lại thành một thể thống nhất (một khối dữ liệu duy nhất)
*/
struct ElectionParams {
    string name; // Tên hòm phiếu / câu hỏi (<= 200 byte)
    string metadataURL; // CID IPFS chứa mô tả + ảnh (không bắt buộc, có thể để trống)
    uint8 kind; // 0 = Candidates (bầu ứng viên), 1 = Proposal (bỏ phiếu vấn đề) -> Số nguyên không dấu 8-bit (0-255)
    bool isPrivate; // true = chỉ ví trong whitelist mới được bỏ phiếu (riêng tư)
    uint256 maxChoices; // Số lựa chọn tối đa mỗi cử tri được chọn
    uint64 startTime; // Unix time bắt đầu; 0 = mở ngay khi tạo
    uint64 endTime; // Unix time kết thúc; 0 = không hẹn giờ, chỉ đóng thủ công
    string[] options; // Danh sách lựa chọn (2..50), cố định sau khi tạo
}

/// @title Election - 1 hòm phiếu do 1 ví làm chủ (Đặt tiêu đề hoặc mô tả cho contract)
/// @dev Chủ sở hữu (owner) là ví đã gọi ElectionFactory.createElection (thông tin kỹ thuật -> quy tắc, logic)
contract Election {
    enum Kind { Candidates, Proposal }
    enum Status { Upcoming, Open, Ended, ClosedByOwner }

    uint256 public constant MAX_OPTIONS = 50;
    uint256 public constant MAX_NAME_BYTES = 200;
    uint256 public constant MAX_LABEL_BYTES = 100;
    uint256 public constant MAX_BATCH = 200;

    address public immutable factory;
    address public immutable owner;

    string public name;
    string public metadataURL;
    Kind public kind;
    bool public isPrivate;
    uint256 public maxChoices;
    uint64 public startTime;
    uint64 public endTime;
    bool public closedByOwner;
    uint256 public totalVoters;

    string[] private _options;
    mapping (uint256 => uint256) public voteCounts; // công khai kết quả kiểm phiếu
    mapping (address => bool) public hasVoted; // ghi nhận xem một địa chỉ đã bỏ phiếu hay chưa
    mapping (address => bool) public whitelist; // kiểm tra xem địa chỉ có được bỏ phiếu không (riêng tư)

    // Events (watcher backend lắng nghe các event này)
    // choices nằm ngay trong event: backend không cần gọi thêm RPC (Remote Procedure Call) để biết ai chọn gì.
    event VoteCast(address indexed voter, uint256[] choices); // phát ra khi có cử tri bỏ phiếu thành công
    event VoterWhitelisted(address indexed voter); // phát ra khi thêm thành công cử tri danh sách (riêng tư)
    event VoterRemoved(address indexed voter); // phát ra khi gỡ một cử tri khỏi danh sách (riêng tư)
    event ScheduleChanged(uint64 startTime, uint64 endTime); // phát ra khi chủ hòm phiếu thay đổi thời gian
    event ElectionClosed(address indexed by, uint256 at); // phát ra khi chủ hòm phiếu đóng cửa hòm phiếu sớm

    // Kiểm tra quyền chủ sở hữu (Owner)
    modifier onlyOwner() {
        require(msg.sender == owner, "Loi: Chi chu hom phieu moi duoc thuc hien");
        _;
    }

    // Kiểm tra hòm phiếu chưa kết thúc
    modifier notFinished() {
        Status s = status(); // lấy trạng thái hiện tại của hòm phiếu
        require(s == Status.Upcoming || s == Status.Open, "Loi: Hom phieu da ket thuc");
        _;
    }
    
    constructor(address owner_, ElectionParams memory p) {
        require(owner_ != address(0), "Loi: Chu hom phieu khong hop le");

        // Kiểm tra độ dài tên hòm phiếu + loại hòm phiếu
        uint256 nameLen = bytes(p.name).length;
        require(nameLen > 0 && nameLen <= MAX_NAME_BYTES, "Loi: Ten hom phieu phai tu 1 den 200 byte");
        require(p.kind <= uint8(Kind.Proposal), "Loi: Loai hom phieu khong hop le");

        // Kiểm tra tính hợp lệ của số lượng lựa chọn và cấu hình giới hạn chọn
        uint256 n = p.options.length;
        require(n >= 2 && n <= MAX_OPTIONS, "Loi: Can tu 2 den 50 lua chon");
        require(p.maxChoices >= 1 && p.maxChoices <= n, "Loi: So lua chon toi da phai tu 1 den so lua chon");

        // Kiểm tra nhãn không rỗng, không quá dài, không trùng nhau (so sánh bằng hash)
        bytes32[] memory hashes = new bytes32[](n);
        for (uint256 i = 0; i < n; i++) {
            uint256 len = bytes(p.options[i]).length;
            require(len > 0 && len <= MAX_LABEL_BYTES, "Loi: Moi lua chon phai tu 1 den 100 byte");
            hashes[i] = keccak256(bytes(p.options[i]));
            for (uint256 j = 0; j < i; j++) {
                require(hashes[j] != hashes[i], "Loi: Cac lua chon khong duoc trung nhau");
            }
            _options.push(p.options[i]);
        }

        // Thiết lập và kiểm tra tính hợp lệ của thời gian bắt đầu và kết thúc cho hòm phiếu
        uint64 start = p.startTime == 0 ? uint64(block.timestamp) : p.startTime;
        if (p.endTime != 0) {
            require(p.endTime > start && p.endTime > block.timestamp, "Loi: Thoi gian ket thuc khong hop le");
        }

        factory = msg.sender;
        owner = owner_;
        name = p.name;
        metadataURL = p.metadataURL;
        kind = Kind(p.kind);
        isPrivate = p.isPrivate;
        maxChoices = p.maxChoices;
        startTime = start;
        endTime =p.endTime;
    }

    // Xác định và trả về trạng thái hiện tại của hòm phiếu
    function  status() public view returns (Status) {
        if (closedByOwner) return Status.ClosedByOwner; // chủ hòm phiếu đóng sớm
        if (block.timestamp < startTime) return Status.Upcoming; // hòm phiếu sắp diễn ra
        if (endTime != 0 && block.timestamp >= endTime) return Status.Ended; // hòm phiếu rơi và trạng thái kết thúc khi đã quá time
        return Status.Open; // trạng thái đang mở của hòm phiếu (nếu thoả điều kiện)
    }

    // Xử lý logic bỏ phiếu của cử tri.
    /**
     * @param choices Danh sách id lựa chọn. 
     * Hợp lệ khi: 1 <= số lượng <= maxChoices, mỗi id tồn tại và không có id nào lặp lại.
     */
    function vote(uint256[] calldata choices) external {
        require(status() == Status.Open, "Loi: Hom phieu chua mo hoac da dong");
        require(!hasVoted[msg.sender], "Loi: Ban da bo phieu roi");
        if (isPrivate) {
            require(whitelist[msg.sender], "Loi: Ban khong co trong danh sach Whitelist");
        }

        uint256 n = choices.length;
        require(n >= 1, "Loi: Phai chon it nhat mot lua chon");
        require(n <= maxChoices, "Loi: Chon vuot qua so luong cho phep");

        uint256 count = _options.length;
        for (uint256 i = 0; i < n; i++) {
            require(choices[i] < count, "Loi: Lua chon khong ton tai");
            for (uint256 j = 0; j < i; j++) {
                require(choices[j] != choices[i], "Loi: Khong duoc chon trung lua chon");
            }
        }

        hasVoted[msg.sender] = true; // đánh dấu địa chỉ này đã bỏ phiếu
        totalVoters++; // tăng tổng số lượng cử tri tham gia hòm phiếu lên 1
        for (uint256 i = 0; i < n; i++) {
            voteCounts[choices[i]]++; // tăng số lượng phiếu bầu lên 1 cho từng lựa chọn mà cử tri đã chọn
        }

        emit VoteCast(msg.sender, choices); // phát ra sự kiện (emit) kèm theo địa chỉ người bỏ phiếu và danh sách lựa chọn của họ
    }

    // Logic thao tác hòm phiếu của chủ sở hữu

    /**
     * @dev
     * Thêm cử tri vào whitelist (riêng tư)
     * Địa chỉ đã có thì bỏ qua
     */
    function addToWhitelist(address[] calldata voters) external onlyOwner notFinished {
        require(isPrivate, "Loi: Hom phieu cong khai khong dung whitelist");
        require(voters.length <= MAX_BATCH, "Loi: Toi da 200 dia chi moi lan");
        for (uint256 i = 0; i < voters.length; i++) {
            address v = voters[i];
            require(v != address(0), "Loi: Dia chi khong hop le");
            // kiểm tra tồn tại của địa chỉ
            if (!whitelist[v]) {
                whitelist[v] = true; // cấp quyền
                emit VoterWhitelisted(v); // phát sự kiện cập nhật dữ liệu nếu thoả
            }
        }
    }

    /**
     * @dev 
     * Gỡ cử tri khỏi whitelist
     * Điều kiện: người đó chưa bỏ phiếu
     */
    function removeFromWhitelist(address[] calldata voters) external onlyOwner notFinished {
        require(voters.length <= MAX_BATCH, "Loi: Toi da 200 dia chi moi mot lan");
        for (uint256 i = 0; i < voters.length; i++) {
            address v = voters[i];
            // kiểm tra tồn tại của địa chỉ
            if (whitelist[v]) {
                require(!hasVoted[v], "Loi: Cu tri nay da bo phieu, khong the go");
                whitelist[v] = false; // thu quyền
                emit VoterRemoved(v); // phát sự kiện cập nhật dữ liệu nếu thoả
            }
        }
    }

    /// @dev Đóng hòm phiếu ngay lập tức (không thể mở lại)
    function closeEarly() external onlyOwner notFinished {
        closedByOwner = true; // cập nhật trạng thái khoá
        emit ElectionClosed(msg.sender, block.timestamp); // phát sự kiện (địa chỉ đóng - mốc thời gian)
    }

    /**
     * @dev
     * Đổi lịch
     * Chỉ được khi hòm phiếu chưa bắt đầu (không đổi luật giữa chừng)
     */
    function reschedule(uint64 newStart, uint64 newEnd) external onlyOwner {
        require(status() == Status.Upcoming, "Loi: Chi duoc doi lich truoc khi bat dau");
        uint64 start = newStart == 0 ? uint64(block.timestamp) : newStart;
        if (newEnd != 0) {
            require(newEnd > start && newEnd > block.timestamp, "Loi: Thoi gian ket thuc khong hop le");
        }
        startTime = start;
        endTime = newEnd;
        emit ScheduleChanged(start, newEnd);
    }

    // Logic đọc dữ liệu
    function optionsCount() external view returns (uint256) {
        return _options.length; // tổng số lượng lựa chọn trong hòm phiếu
    }

    function option(uint256 id) external view returns (string memory) {
        require(id < _options.length, "Loi: Lua chon khong ton tai");
        return _options[id];
    }

    function getOptions() external view returns (string[] memory) {
        return _options;
    }

    /**
     * @return counts
     * Số phiếu của từng lựa chọn, theo tứ tự id 0..n-1
     */
    function getResults() external view returns (uint256[] memory counts) {
        uint256 n = _options.length;
        counts = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            counts[i] = voteCounts[i];
        }
    }
}

// Máy chủ quản lý trung tâm - dùng để khởi tạo và lưu trữ
/**
 * @title ElectionFactory
 * Ai cũng tạo được hòm phiếu, người tạo là chủ sở hữu
 */
contract ElectionFactory {
    address[] private _elections; // danh sách lưu lại toàn bộ địa chỉ của các Smart Contract hòm phiếu đã tạo

    // Sự kiện ghi lại lịch sử lên blockchain khi tạo hòm phiếu thành công
    event ElectionCreated(
        address indexed election,
        address indexed owner,
        string name,
        uint8 kind,
        bool isPrivate,
        uint256 maxChoices,
        uint64 startTime,
        uint64 endTime,
        string metadataURL
    );

    // Triển khai một Smart Contract hòm phiếu mới lên blockchain
    function createElection(ElectionParams memory p) external returns (address) {
        Election e = new Election(msg.sender, p); // triển khai một Smart Contract hòm phiếu đọc lập mới
        _elections.push(address(e));
        // phát sự kiện ghi log lên blockchain
        emit ElectionCreated(
            address(e), 
            msg.sender, 
            p.name, 
            p.kind, 
            p.isPrivate,
            p.maxChoices, 
            e.startTime(), // dùng đúng thời gian thực
            p.endTime, 
            p.metadataURL
        );
        return address(e);
    }

    // Hàm đọc dữ liệu
    function electionsCount() external view returns (uint256) {
        return _elections.length; // kích thước mảng - tổng số lượng các từng được tạo ra
    }

    // Hàm lấy ra địa chỉ của một hòm phiếu cụ thể dựa vào vị trí của nó trong danh sách
    function electionAt(uint256 index) external view returns (address) {
        return _elections[index]; // trả về địa chỉ đúng vị trí 
    }

    /**
     * @dev
     * Phân trang để không trả về mảng quá lớn
     */
    function getElections(uint256 offset, uint256 limit) external view returns (address[] memory page) {
        uint256 total = _elections.length; // lấy tổng số lượng hòm phiếu
        if (offset >= total) return new address[](0); // kiểm tra an toàn
        uint256 end = offset + limit > total ? total : offset + limit;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _elections[i];
        }
    }
}