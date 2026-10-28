/**
 * Script tự động trích xuất ABI từ artifacts/ của Hardhat ra thư mục gốc.
 * Chạy sau khi: npx hardhat compile
 * Lệnh: node scripts/export_abi.js
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// 1. Thiết lập đường dẫn
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// 2. Khai báo các đường dẫn nguồn và đích đến (input - output)
// danh sách đường dẫn tuyệt đối tới các file artifact do Hardhat tạo ra sau khi compile
const ARTIFACTS = {
  Election: resolve(ROOT, 'artifacts/blockchain/contracts/VotingSystem.sol/Election.json'),
  ElectionFactory: resolve(ROOT, 'artifacts/blockchain/contracts/VotingSystem.sol/ElectionFactory.json'),
};
// danh sách các file đích mà script sẽ xuất dữ liệu ra
const OUTPUT = {
  Election_ABI: resolve(ROOT, 'Election_ABI.json'),
  Factory_ABI: resolve(ROOT, 'Factory_ABI.json'),
  Browser_ABI: resolve(ROOT, 'static/js/abi.js'),   // cho frontend — sinh từ CÙNG nguồn nên không bao giờ lệch
};

// 3. Kiểm tra điều kiện tiên quyết
// cờ trạng thái -> các file artifact đầu vào đã sẵn sàng
let ok = true;

// duyệt qua từng file artifact để xác nhận xem đã chạy lệnh compile chưa
for (const [name, path] of Object.entries(ARTIFACTS)) {
  if (!existsSync(path)) {
    console.error(`Không tìm thấy: ${path}`);
    console.error(`   → Hãy chạy: npx hardhat compile trước`);
    ok = false; // đánh dấu lỗi nếu thiếu bất kỳ file nào
  }
}

// Dừng script nếu không thảo điều kiện
if (!ok) process.exit(1);

// 4. Đọc file và giải mã nội dung
const electionArtifact = JSON.parse(readFileSync(ARTIFACTS.Election, 'utf8'));
const factoryArtifact = JSON.parse(readFileSync(ARTIFACTS.ElectionFactory, 'utf8'));

// 5. Xuất các file JSON cho backend/indexer
writeFileSync(OUTPUT.Election_ABI, JSON.stringify(electionArtifact.abi, null, 2));
writeFileSync(OUTPUT.Factory_ABI, JSON.stringify(factoryArtifact.abi, null, 2));

// 6. Xuất file js cho fontend trình duyệt
writeFileSync(OUTPUT.Browser_ABI,
  '// Tự động sinh bởi scripts/export_abi.js — Không sửa tay. Chạy: node scripts/export_abi.js\n' +
  `window.ELECTION_ABI = ${JSON.stringify(electionArtifact.abi, null, 2)};\n\n` +
  `window.FACTORY_ABI = ${JSON.stringify(factoryArtifact.abi, null, 2)};\n`);

// 7. Thông báo và in danh sách sự kiện
console.log('Election_ABI.json — đã cập nhật');
console.log('static/js/abi.js  — đã cập nhật (cho trình duyệt)');
console.log('Factory_ABI.json  — đã cập nhật');
console.log('');
console.log('Events có trong Election_ABI:');
electionArtifact.abi
  .filter(x => x.type === 'event')
  .forEach(e => console.log(`   ${e.name}(${e.inputs.map(i => `${i.type} ${i.name}`).join(', ')})`));
