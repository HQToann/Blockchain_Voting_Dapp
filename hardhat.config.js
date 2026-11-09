import "@nomicfoundation/hardhat-toolbox";  // bộ công cụ chuẩn của Hardhat

import "dotenv/config"; // tự động nạp biến .env

export default {
  // 1. Cấu hình trình biên dịch Solidity
  solidity: {
    version: "0.8.26",  // phiên bản biên dịch
    settings: {
      optimizer: {
        enabled: true,  // trình tối ưu hoá bytecode
        runs: 200,  // giá trị cân bằng giứ phí gas deploy và phí gas hàm thực thi
      },
    },
  },

  // 2. Định tuyến được dẫn thư mục dự án -> blockchain
  paths: {
    sources: "./blockchain/contracts", // smart contract
    tests: "./blockchain/test", // unit test
    ignition: "./blockchain/ignition",  // auto deploy for hardhat
    cache: "./cache", // cache hỗ trợ biên dịch nhanh
    artifacts: "./artifacts", // lưu kết quả sau khi biên dịch
  },


  // 3. Cấu hình mạng blockchain -> ethereum sepolia testnet
  networks: {
    sepolia: {
      url: process.env.INFURA_RPC_URL || process.env.RPC_URL || "", // địa chỉ RPC Node (Infura) -> gửi/nhận giao dịch blockchain
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [], // private key metamask
    },
  },
};

