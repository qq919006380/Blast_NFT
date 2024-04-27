import { expect } from "chai";
import hre from "hardhat";
import artifacts from "../ignition/deployments/chain-168587773/artifacts/ERC721NFTModule#v_2.json";
import deployed_addresses from "../ignition/deployments/chain-168587773/deployed_addresses.json";
import address from "../address.json";
import Decimal from "decimal.js";

let lock: any;

let owner: { provider: any; address: string };
let addr1: { provider: any; address: string };
let addr2: { provider: any; address: string };
let addr3: { provider: any; address: string };

let MINT_PRICE: string;

before(async function () {
  // 重新部署合约
  lock = await hre.ethers.deployContract("ERC721NFT", [], {});

  // 使用已部署的合约
  // lock = await hre.ethers.getContractAt(
  //   artifacts.abi,
  //   deployed_addresses["ERC721NFTModule#v_2"]
  // );

  let price = await lock.MINT_PRICE();
  MINT_PRICE = ethers.formatEther(price);
  console.log("Mint 价格:", MINT_PRICE);
  // 测试账号
  [owner, addr1, addr2, addr3] = await ethers.getSigners();
});

after(async function () {
  console.log(`✅ active finish  addres ：${lock.target}`);
  // const balance = await ethers.provider.getBalance(lock.target);
  // console.log(`Contract balance: ${ethers.formatEther(balance)} ETH`);
  // if (balance > 0) {
  //   // 现在尝试提款
  //   await expect(lock.connect(owner).withdraw())
  //   console.log("执行提款", balance);
  // }
  // // 提取合约的余额
  // await lock.connect(owner).claimGasFees(owner.address);
});
describe("Base Test", function () {
  it("Check name", async function () {
    expect(await lock.name()).to.equal("ChatyN ZHOU");
  });
});

describe("Whitelist management", function () {
  it("Should add and remove an address from the whitelist", async function () {
    console.log(address);
    await lock.addToWhitelist(address);

    await lock.addToWhitelist([addr1.address]);
    expect(await lock.isWhitelisted(addr1.address)).to.equal(true);

    await lock.removeFromWhitelist([addr1.address]);
    expect(await lock.isWhitelisted(addr1.address)).to.equal(false);
  });
});

describe("Mint functionality in Whitelist phase", async function () {
  it(`Whitelist phase: should mint a new token`, async function () {
    console.log("MINT_PRICE", MINT_PRICE);
    // 假设addToWhitelist是添加地址到白名单的函数
    await lock.addToWhitelist([owner.address]);

    // 设置销售阶段到白名单
    await lock.setSalePhase(1); // 1代表白名单阶段

    await expect(
      lock.connect(owner).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.emit(lock, "Transfer");

    // 获取拥有者名下的所有 Token ID
    let tokensOfOwner = await lock.tokensOfOwner(owner.address);
    expect(tokensOfOwner).to.have.lengthOf.at.least(1); // 确保至少有一个代币被铸造

    // 获取最新铸造的 Token ID，假设是数组中的最后一个
    const newTokenId = tokensOfOwner[tokensOfOwner.length - 1];

    // 现在使用这个 Token ID 检查所有权
    expect(await lock.ownerOf(newTokenId)).to.equal(owner.address);

    // 可以继续使用 newTokenId 来做其他的检查，比如再次触发 Transfer 事件
    await expect(
      lock.connect(owner).transferFrom(owner.address, addr1.address, newTokenId)
    )
      .to.emit(lock, "Transfer")
      .withArgs(owner.address, addr1.address, newTokenId);

    await expect(
      lock.connect(owner).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.be.revertedWith("Already minted in this phase");
  });

  it("Whitelist phase: should fail if the address is not in whitelist", async function () {
    // 切换到一个不在白名单中的用户
    await lock.setSalePhase(1); // 确保仍在白名单阶段
    await expect(
      lock.connect(addr1).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.be.revertedWith("Not in whitelist");
  });
});

describe("Mint functionality in Public phase", async function () {
  it("Public phase: should allow anyone to mint with correct price", async function () {
    // 设置销售阶段到公售
    await lock.setSalePhase(2); // 确保代表公售阶段

    const quantityToMint = 3;
    let value1 = new Decimal(Number(MINT_PRICE));
    let value2 = new Decimal(quantityToMint);
    let num = value1.times(value2);

    const totalMintCost = ethers.parseEther(String(num));

    // 检查在铸造前的剩余供应量
    const initialRemainingSupply = await lock.remainingSupply();

    // 铸造3个代币
    await expect(
      lock.connect(addr1).mint(quantityToMint, { value: totalMintCost })
    ).to.emit(lock, "Transfer"); // 检查是否发出了Transfer事件

    // 获取铸造后拥有者名下的所有 Token ID
    let tokensOfOwner = await lock.tokensOfOwner(addr1.address);
    expect(tokensOfOwner).to.have.lengthOf.at.least(quantityToMint); // 确保至少有3个代币被铸造

    // 获取最后一个铸造的 Token ID
    const newTokenId = tokensOfOwner[tokensOfOwner.length - 1];
    console.log("newTokenId of the last minted token:", newTokenId);

    // 使用最新的 Token ID 检查所有权
    expect(await lock.ownerOf(newTokenId)).to.equal(addr1.address);

    // 验证铸造后的剩余供应量是否正确
    const finalRemainingSupply = await lock.remainingSupply();

    expect(finalRemainingSupply).to.equal(
      initialRemainingSupply - BigInt(quantityToMint)
    );
  });

  it("Public phase: should fail if the mint price is incorrect", async function () {
    await lock.setSalePhase(2); // 确保在公售阶段
    await expect(
      lock.connect(addr1).mint(1, { value: ethers.parseEther("0.0012") })
    ).to.be.revertedWith("Incorrect value sent");
  });
});

describe("Mint functionality in Stop phase", async function () {
  it("Stop phase:  Minting not yet available", async function () {
    await lock.setSalePhase(0); // 确保在停止阶段
    await expect(
      lock.connect(addr1).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.be.revertedWith("Not available");
  });
});

describe("Payee management", function () {
  it("should set initial payee to the deployer", async function () {
    expect(await lock.getPayee()).to.equal(owner.address);
  });

  it("should allow owner to change the payee", async function () {
    await lock.setPayee(addr1.address);
    expect(await lock.getPayee()).to.equal(addr1.address);
  });

  it("should prevent non-owners from changing the payee", async function () {
    await expect(lock.connect(addr1).setPayee(addr2.address)).to.be.reverted;
  });
});

describe("batchAirdrop functionality", function () {
  it("batchAirdrop ", async function () {
    // 准备批量空投的地址数组
    const addresses = [owner.address, addr1.address];
    const beforeBalances = await Promise.all(
      addresses.map(async (address) => await lock.balanceOf(address))
    );

    // 执行批量空投
    await lock.batchAirdrop(addresses);

    // 检查每个地址的余额是否正确增加
    for (let i = 0; i < addresses.length; i++) {
      const afterBalance = await lock.balanceOf(addresses[i]);
      expect(afterBalance).to.equal(beforeBalances[i] + BigInt(1)); // 假设每次空投增加1个代币
    }
  });
});

describe("Base URI Management", function () {
  it("setBaseURI ", async function () {
    await lock.setSalePhase(2); //公售

    await expect(
      lock.connect(owner).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.emit(lock, "Transfer");

    let tokensOfOwner = await lock.tokensOfOwner(owner.address);
    const newTokenId = tokensOfOwner[tokensOfOwner.length - 1];

    await lock.setBaseURI("baidu.com/");
    let tokenURI = await lock.tokenURI(newTokenId);
    expect(tokenURI).to.equal(`baidu.com/${newTokenId}.json`);
  });

  it("non-owner setBaseURI", async function name() {
    await expect(lock.connect(addr1).setBaseURI("baidu.com/")).to.be.reverted;
  });
});

describe("Role management", function () {
  it("Only accounts with OPERATOR_ROLE should call restrictedFunction", async function () {
    const [owner, addr1] = await ethers.getSigners();

    let OPERATOR_ROLE = await lock.OPERATOR_ROLE();

    // 尝试由没有OPERATOR_ROLE的账户调用restrictedFunction
    await expect(
      lock.connect(addr1).addToWhitelist([addr2.address])
    ).to.be.revertedWith("Must have operator role or be owner");
    expect(await lock.isWhitelisted(addr2.address)).to.equal(false);

    // 给addr1授予OPERATOR_ROLE
    await lock.connect(owner).grantRole(OPERATOR_ROLE, addr1.address);

    // 再次尝试，现在应该成功
    await expect(lock.connect(addr1).addToWhitelist([addr2.address])).not.to.be
      .reverted;
    expect(await lock.isWhitelisted(addr2.address)).to.equal(true);
  });
});

describe("Withdraw", function () {
  it("should allow the owner to withdraw funds", async function () {
    // First, mint a new token to ensure there are funds in the contract
    await lock.connect(owner).mint(1, { value: ethers.parseEther(MINT_PRICE) });

    const initialOwnerBalance = await ethers.provider.getBalance(owner.address);

    const tx = await lock.connect(owner).withdraw();
    const receipt = await tx.wait();
    const transactionFee = receipt.gasUsed * receipt.gasPrice; // 使用`gasUsed`和`gasPrice`来计算交易费

    const finalOwnerBalance = await ethers.provider.getBalance(owner.address);

    //  检查最终余额是否正确（初始余额 + 0.5 ETH - 提现调用的交易费）
    expect(finalOwnerBalance.toString().substring(0, 3)).to.equal(
      (initialOwnerBalance + ethers.parseEther(MINT_PRICE) - transactionFee)
        .toString()
        .substring(0, 3)
    );

    console.log(1, finalOwnerBalance.toString().substring(0, 3));
    console.log(
      2,
      (initialOwnerBalance + ethers.parseEther(MINT_PRICE) - transactionFee)
        .toString()
        .substring(0, 3)
    );
  });

  it("should fail if a non-owner tries to withdraw funds", async function () {
    await expect(lock.connect(addr1).withdraw()).to.be.reverted;
  });
});

describe.only("check mint ids", async function () {
  this.timeout(0); // 禁用整个测试套件的超时
  function sleep(time: number) {
    return new Promise((res) => {
      setTimeout(() => {
        res(true);
      }, time);
    });
  }
  it("mint remainingSupply", async function () {
    await lock.setSalePhase(2); // 确保代表公售阶段

    let remainingSupply = await lock.remainingSupply();
    console.log(`剩余${remainingSupply}没有mint完`);
    let i = 0;
    let quantity = 100; //每次mint数量
    while (i < remainingSupply) {
      try {
        let priceDec = new Decimal(Number(MINT_PRICE));
        let quantityDec = new Decimal(quantity);
        let totalPriceDec = priceDec.times(quantityDec); //总价格

        const totalMintCost = ethers.parseEther(String(totalPriceDec));

        // 发送交易并获取交易响应对象
        const txResponse = await lock
          .connect(addr1)
          .mint(quantity, { value: totalMintCost });

        // 等待交易被矿工确认
        const txReceipt = await txResponse.wait();
        await sleep(800);
        if (txReceipt.status == 1) {
          i++;
        } else {
          console.log("mint 失败，重新mint");
        }

        let tokensOfOwner = await lock.tokensOfOwner(addr1.address);
        console.log(
          `mint 第${i}个mint,id:${tokensOfOwner[tokensOfOwner.length - 1]}`
        );
      } catch (e) {
        console.log("失败", e);
      }
    }

    await expect(
      lock.connect(addr1).mint(1, { value: ethers.parseEther(MINT_PRICE) })
    ).to.be.revertedWith("Exceeds maximum supply");
  });
});
