/**
 * CẤU HÌNH TRUNG TÂM HARDHAT - DỰ ÁN DECENTRALIZED VOTING DAPP
 * File này đóng vai trò là "bộ não" điều khiển toàn bộ quy trình phát triển Blockchain:
 * - Biên dịch Smart Contract (Solidity solc compiler & optimizer)
 * - Định vị cấu trúc các thư mục mã nguồn, kiểm thử, script deploy và artifacts
 * - Cấu hình thông số kết nối các mạng blockchain (Localhost, Sepolia Testnet)
 */

// Bộ công cụ chuẩn của Hardhat: bao gồm Ethers.js, Hardhat Ignition, Chai matchers, Mocha test runner, v.v.
import "@nomicfoundation/hardhat-toolbox";

// Nạp tự động các biến môi trường từ file .env vào process.env (RPC URL, Private Key)
import "dotenv/config";

export default {
  /**
   * 1. CẤU HÌNH TRÌNH BIÊN DỊCH SOLIDITY
   */
  solidity: {
    // Phiên bản trình biên dịch Solidity (phải khớp với khai báo pragma trong file .sol)
    version: "0.8.26",
    settings: {
      optimizer: {
        // Bật trình tối ưu hóa mã máy Bytecode
        enabled: true,
        // runs: 200 là giá trị tối ưu cân bằng giữa chi phí gas khi Deploy và gas khi gọi hàm thực thi
        // Rất quan trọng khi ElectionFactory chứa toàn bộ bytecode của Election để tạo contract con
        runs: 200,
      },
    },
  },

  /**
   * 2. ĐỊNH TUYẾN ĐƯỜNG DẪN THƯ MỤC DỰ ÁN
   * Chỉ định cho Hardhat biết vị trí đọc file nguồn và nơi xuất sản phẩm biên dịch
   */
  paths: {
    sources: "./blockchain/contracts", // Chứa mã nguồn hợp đồng thông minh (.sol)
    tests: "./blockchain/test",      // Chứa các kịch bản kiểm thử tự động (Unit Test)
    ignition: "./blockchain/ignition",  // Chứa các module triển khai tự động bằng Hardhat Ignition
    cache: "./cache",                // Thư mục lưu cache biên dịch (giúp compile nhanh hơn)
    artifacts: "./artifacts",            // Thư mục lưu kết quả sau biên dịch (Bytecode, ABI, metadata)
  },

  /**
   * 3. CẤU HÌNH CÁC MẠNG BLOCKCHAIN (NETWORKS)
   * Định nghĩa cách Hardhat kết nối và tương tác với các mạng thử nghiệm hoặc mainnet
   */
  networks: {
    // Cấu hình mạng thử nghiệm Ethereum Sepolia Testnet
    sepolia: {
      // Địa chỉ RPC Node (Infura hoặc Alchemy) để gửi nhận giao dịch lên mạng Sepolia
      url: process.env.INFURA_RPC_URL || process.env.RPC_URL || "",
      // Private Key của ví cá nhân (có chứa Sepolia ETH) dùng để ký và trả phí gas khi deploy
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};

