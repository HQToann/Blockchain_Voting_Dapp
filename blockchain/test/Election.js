import { expect } from "chai";
import pkg from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
const { ethers } = pkg;

// Các giá trị enum Status trong contract
const Status = { Upcoming: 0n, Open: 1n, Ended: 2n, ClosedByOwner: 3n };

// Tham số mặc định: hòm phiếu công khai, chọn tối đa 1, mở ngay, không hẹn giờ kết thúc.
function params(over = {}) {
  return {
    name: "Bau lop truong",
    metadataURI: "",
    kind: 0,
    isPrivate: false,
    maxChoices: 1,
    startTime: 0,
    endTime: 0,
    options: ["An", "Binh", "Chi"],
    ...over,
  };
}

describe("Nen tang hom phieu cong dong", function () {
  let factory, alice, bob, carol, dave, eve;

  // Tạo hòm phiếu qua Factory bằng ví `signer`, trả về contract Election đã gắn địa chỉ.
  async function createElection(signer, over = {}) {
    const tx = await factory.connect(signer).createElection(params(over));
    const receipt = await tx.wait();
    const ev = receipt.logs
      .map((l) => { try { return factory.interface.parseLog(l); } catch { return null; } })
      .find((e) => e && e.name === "ElectionCreated");
    return ethers.getContractAt("Election", ev.args.election);
  }

  beforeEach(async function () {
    [alice, bob, carol, dave, eve] = await ethers.getSigners();
    const F = await ethers.getContractFactory("ElectionFactory");
    factory = await F.deploy();
  });

  describe("ElectionFactory — ai cung tao duoc, nguoi tao la chu", function () {
    it("Bat ky vi nao cung tao duoc hom phieu va tro thanh owner", async function () {
      const e1 = await createElection(alice);
      const e2 = await createElection(bob, { name: "Hom phieu cua Bob" });
      expect(await e1.owner()).to.equal(alice.address);
      expect(await e2.owner()).to.equal(bob.address);
      expect(await e2.name()).to.equal("Hom phieu cua Bob");
      expect(await e1.factory()).to.equal(await factory.getAddress());
    });

    it("Phat event ElectionCreated day du thong tin cho watcher", async function () {
      const p = params({ name: "Cau hoi X", kind: 1, isPrivate: true, maxChoices: 2, metadataURI: "bafyTest", endTime: (await time.latest()) + 3600 });
      await expect(factory.connect(carol).createElection(p))
        .to.emit(factory, "ElectionCreated")
        .withArgs(
          (addr) => ethers.isAddress(addr), carol.address,
          "Cau hoi X", 1, true, 2, (s) => s > 0n, p.endTime, "bafyTest"
        );
    });

    it("Luu danh sach va phan trang hom phieu", async function () {
      for (let i = 0; i < 5; i++) await createElection(i % 2 ? alice : bob);
      expect(await factory.electionsCount()).to.equal(5n);
      expect((await factory.getElections(0, 2)).length).to.equal(2);
      expect((await factory.getElections(4, 10)).length).to.equal(1);
      expect((await factory.getElections(9, 10)).length).to.equal(0);
      expect(await factory.electionAt(0)).to.equal((await factory.getElections(0, 1))[0]);
    });

    it("Chan tham so khong hop le", async function () {
      const bad = async (over) => factory.connect(alice).createElection(params(over));
      const now = await time.latest();
      await expect(bad({ name: "" })).to.be.revertedWith("Loi: Ten hom phieu phai tu 1 den 200 byte");
      await expect(bad({ name: "x".repeat(201) })).to.be.revertedWith("Loi: Ten hom phieu phai tu 1 den 200 byte");
      await expect(bad({ options: ["Chi mot"] })).to.be.revertedWith("Loi: Can tu 2 den 50 lua chon");
      await expect(bad({ options: Array.from({ length: 51 }, (_, i) => "Opt" + i) })).to.be.revertedWith("Loi: Can tu 2 den 50 lua chon");
      await expect(bad({ maxChoices: 0 })).to.be.revertedWith("Loi: So lua chon toi da phai tu 1 den so lua chon");
      await expect(bad({ maxChoices: 4 })).to.be.revertedWith("Loi: So lua chon toi da phai tu 1 den so lua chon");
      await expect(bad({ options: ["A", "B", "A"] })).to.be.revertedWith("Loi: Cac lua chon khong duoc trung nhau");
      await expect(bad({ options: ["A", ""] })).to.be.revertedWith("Loi: Moi lua chon phai tu 1 den 100 byte");
      await expect(bad({ options: ["A", "y".repeat(101)] })).to.be.revertedWith("Loi: Moi lua chon phai tu 1 den 100 byte");
      await expect(bad({ kind: 2 })).to.be.revertedWith("Loi: Loai hom phieu khong hop le");
      await expect(bad({ startTime: now + 1000, endTime: now + 500 })).to.be.revertedWith("Loi: Thoi gian ket thuc khong hop le");
      await expect(bad({ endTime: now - 10 })).to.be.revertedWith("Loi: Thoi gian ket thuc khong hop le");
    });

    it("Tao duoc hom phieu toi da 50 lua chon", async function () {
      const options = Array.from({ length: 50 }, (_, i) => "Lua chon " + i);
      const e = await createElection(alice, { options, maxChoices: 50 });
      expect(await e.optionsCount()).to.equal(50n);
    });

    it("Hom phieu cua nguoi nay khong anh huong hom phieu cua nguoi khac", async function () {
      const a = await createElection(alice);
      const b = await createElection(bob);
      await a.connect(carol).vote([0]);
      expect(await a.totalVoters()).to.equal(1n);
      expect(await b.totalVoters()).to.equal(0n);
      expect(await b.hasVoted(carol.address)).to.equal(false);
      await expect(a.connect(bob).closeEarly()).to.be.revertedWith("Loi: Chi chu hom phieu moi duoc thuc hien");
      await b.connect(bob).closeEarly(); // bob la chu cua b
    });
  });

  describe("Bo phieu — gioi han so lua chon (maxChoices)", function () {
    it("maxChoices = 1: chon dung 1 lua chon, doc duoc ket qua va event", async function () {
      const e = await createElection(alice, { maxChoices: 1 });
      await expect(e.connect(bob).vote([1])).to.emit(e, "VoteCast").withArgs(bob.address, [1n]);
      expect(await e.hasVoted(bob.address)).to.equal(true);
      expect(await e.totalVoters()).to.equal(1n);
      expect((await e.getResults()).map(Number)).to.deep.equal([0, 1, 0]);
      await expect(e.connect(carol).vote([0, 1])).to.be.revertedWith("Loi: Chon vuot qua so luong cho phep");
    });

    it("maxChoices = 3: duoc chon 1, 2 hoac 3 nhung khong qua 3", async function () {
      const e = await createElection(alice, { maxChoices: 3, options: ["A", "B", "C", "D", "E"] });
      await e.connect(bob).vote([0]);              // 1 lua chon
      await e.connect(carol).vote([1, 2]);         // 2 lua chon
      await e.connect(dave).vote([0, 3, 4]);       // 3 lua chon
      await expect(e.connect(eve).vote([0, 1, 2, 3]))
        .to.be.revertedWith("Loi: Chon vuot qua so luong cho phep");
      expect((await e.getResults()).map(Number)).to.deep.equal([2, 1, 1, 1, 1]);
      expect(await e.totalVoters()).to.equal(3n);
    });

    it("Chan: khong chon gi, chon trung, chon id khong ton tai", async function () {
      const e = await createElection(alice, { maxChoices: 3, options: ["A", "B", "C"] });
      await expect(e.connect(bob).vote([])).to.be.revertedWith("Loi: Phai chon it nhat 1 lua chon");
      await expect(e.connect(bob).vote([1, 1])).to.be.revertedWith("Loi: Khong duoc chon trung lua chon");
      await expect(e.connect(bob).vote([0, 2, 0])).to.be.revertedWith("Loi: Khong duoc chon trung lua chon");
      await expect(e.connect(bob).vote([3])).to.be.revertedWith("Loi: Lua chon khong ton tai");
      await expect(e.connect(bob).vote([0, 99])).to.be.revertedWith("Loi: Lua chon khong ton tai");
      // Lan vote bi tu choi khong lam mat quyen bo phieu
      expect(await e.hasVoted(bob.address)).to.equal(false);
      await e.connect(bob).vote([0, 1]);
    });

    it("Moi vi chi bo phieu 1 lan (ke ca khi chua dung het maxChoices)", async function () {
      const e = await createElection(alice, { maxChoices: 3 });
      await e.connect(bob).vote([0]);
      await expect(e.connect(bob).vote([1])).to.be.revertedWith("Loi: Ban da bo phieu roi");
    });

    it("Hom phieu kieu van de (Proposal): Dong y / Khong dong y", async function () {
      const e = await createElection(alice, { kind: 1, name: "Co nen doi gio hoc?", options: ["Dong y", "Khong dong y"] });
      expect(await e.kind()).to.equal(1n);
      await e.connect(bob).vote([0]);
      await e.connect(carol).vote([1]);
      await e.connect(dave).vote([0]);
      expect((await e.getResults()).map(Number)).to.deep.equal([2, 1]);
      expect(await e.getOptions()).to.deep.equal(["Dong y", "Khong dong y"]);
      expect(await e.option(1)).to.equal("Khong dong y");
    });
  });

  describe("Hom phieu rieng tu va whitelist", function () {
    it("Chi vi trong whitelist moi duoc bo phieu", async function () {
      const e = await createElection(alice, { isPrivate: true });
      await expect(e.connect(bob).vote([0])).to.be.revertedWith("Loi: Ban khong co trong danh sach Whitelist");
      await expect(e.connect(alice).addToWhitelist([bob.address, carol.address]))
        .to.emit(e, "VoterWhitelisted").withArgs(bob.address);
      await e.connect(bob).vote([0]);
      await expect(e.connect(dave).vote([0])).to.be.revertedWith("Loi: Ban khong co trong danh sach Whitelist");
    });

    it("Them dia chi da co khong phat lai event; duoc them khi dang mo phieu", async function () {
      const e = await createElection(alice, { isPrivate: true });
      await e.addToWhitelist([bob.address]);
      const tx = await e.addToWhitelist([bob.address, carol.address]);
      const r = await tx.wait();
      const evs = r.logs.map((l) => e.interface.parseLog(l)).filter((x) => x.name === "VoterWhitelisted");
      expect(evs.length).to.equal(1);
      expect(evs[0].args.voter).to.equal(carol.address);
    });

    it("Go cu tri chua bo phieu duoc, da bo phieu thi khong", async function () {
      const e = await createElection(alice, { isPrivate: true });
      await e.addToWhitelist([bob.address, carol.address]);
      await e.connect(bob).vote([0]);
      await expect(e.removeFromWhitelist([carol.address])).to.emit(e, "VoterRemoved").withArgs(carol.address);
      await expect(e.connect(carol).vote([0])).to.be.revertedWith("Loi: Ban khong co trong danh sach Whitelist");
      await expect(e.removeFromWhitelist([bob.address])).to.be.revertedWith("Loi: Cu tri nay da bo phieu, khong the go");
    });

    it("Hom phieu cong khai: ai cung vote duoc, khong dung whitelist", async function () {
      const e = await createElection(alice, { isPrivate: false });
      await e.connect(eve).vote([2]);
      await expect(e.addToWhitelist([bob.address])).to.be.revertedWith("Loi: Hom phieu cong khai khong dung whitelist");
    });

    it("Gioi han 200 dia chi moi lan va chan dia chi 0x0", async function () {
      const e = await createElection(alice, { isPrivate: true });
      const many = Array.from({ length: 201 }, () => ethers.Wallet.createRandom().address);
      await expect(e.addToWhitelist(many)).to.be.revertedWith("Loi: Toi da 200 dia chi moi lan");
      await e.addToWhitelist(many.slice(0, 200));
      await expect(e.addToWhitelist([ethers.ZeroAddress])).to.be.revertedWith("Loi: Dia chi khong hop le");
    });
  });

  describe("Phan quyen chu hom phieu", function () {
    it("Chi owner moi thao tac duoc", async function () {
      const e = await createElection(alice, { isPrivate: true });
      const msg = "Loi: Chi chu hom phieu moi duoc thuc hien";
      await expect(e.connect(bob).addToWhitelist([bob.address])).to.be.revertedWith(msg);
      await expect(e.connect(bob).removeFromWhitelist([bob.address])).to.be.revertedWith(msg);
      await expect(e.connect(bob).closeEarly()).to.be.revertedWith(msg);
      await expect(e.connect(bob).reschedule(0, 0)).to.be.revertedWith(msg);
    });
  });

  describe("Hen gio bat dau / ket thuc va dong som", function () {
    it("Chua den gio: khong vote duoc; den gio: vote duoc; het gio: bi khoa", async function () {
      const now = await time.latest();
      const start = now + 1000, end = now + 5000;
      const e = await createElection(alice, { startTime: start, endTime: end });
      expect(await e.status()).to.equal(Status.Upcoming);
      await expect(e.connect(bob).vote([0])).to.be.revertedWith("Loi: Hom phieu chua mo hoac da dong");

      await time.increaseTo(start);
      expect(await e.status()).to.equal(Status.Open);
      await e.connect(bob).vote([0]);

      await time.increaseTo(end);
      expect(await e.status()).to.equal(Status.Ended);
      await expect(e.connect(carol).vote([0])).to.be.revertedWith("Loi: Hom phieu chua mo hoac da dong");
      // da ket thuc thi owner cung khong con quyen thay doi
      await expect(e.closeEarly()).to.be.revertedWith("Loi: Hom phieu da ket thuc");
    });

    it("startTime = 0 nghia la mo ngay; endTime = 0 la khong bao gio het gio", async function () {
      const e = await createElection(alice);
      expect(await e.status()).to.equal(Status.Open);
      expect(await e.endTime()).to.equal(0n);
      await time.increase(365 * 24 * 3600);
      expect(await e.status()).to.equal(Status.Open);
      await e.connect(bob).vote([0]);
    });

    it("Owner dong som: khoa vote ngay, khong the mo lai", async function () {
      const e = await createElection(alice, { endTime: (await time.latest()) + 100000 });
      await e.connect(bob).vote([0]);
      await expect(e.closeEarly()).to.emit(e, "ElectionClosed").withArgs(alice.address, (t) => t > 0n);
      expect(await e.status()).to.equal(Status.ClosedByOwner);
      await expect(e.connect(carol).vote([0])).to.be.revertedWith("Loi: Hom phieu chua mo hoac da dong");
      await expect(e.closeEarly()).to.be.revertedWith("Loi: Hom phieu da ket thuc");
      await expect(e.reschedule(0, 0)).to.be.revertedWith("Loi: Chi doi lich truoc khi bat dau");
    });

    it("Doi lich chi duoc truoc khi bat dau", async function () {
      const now = await time.latest();
      const e = await createElection(alice, { startTime: now + 1000, endTime: now + 2000 });
      await expect(e.reschedule(now + 3000, now + 4000))
        .to.emit(e, "ScheduleChanged").withArgs(now + 3000, now + 4000);
      expect(await e.startTime()).to.equal(BigInt(now + 3000));
      await expect(e.reschedule(now + 5000, now + 4000)).to.be.revertedWith("Loi: Thoi gian ket thuc khong hop le");

      // dat startTime = 0 -> mo ngay, sau do khong doi lich duoc nua
      await e.reschedule(0, 0);
      expect(await e.status()).to.equal(Status.Open);
      await expect(e.reschedule(0, 0)).to.be.revertedWith("Loi: Chi doi lich truoc khi bat dau");
    });

    it("Owner them whitelist truoc gio mo phieu, cu tri vote sau khi mo", async function () {
      const now = await time.latest();
      const e = await createElection(alice, { isPrivate: true, startTime: now + 500 });
      await e.addToWhitelist([bob.address]);
      await time.increaseTo(now + 500);
      await e.connect(bob).vote([2]);
      expect((await e.getResults()).map(Number)).to.deep.equal([0, 0, 1]);
    });
  });
});
