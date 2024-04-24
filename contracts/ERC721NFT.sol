// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./Blast.sol";

contract ERC721NFT is ERC721Enumerable, Ownable, AccessControl {
    using EnumerableSet for EnumerableSet.AddressSet;
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");

    EnumerableSet.AddressSet private _whitelist;
    IBlast public blastContract;
    string private _baseTokenURI;
    mapping(address => bool) public hasMintedInWhitelist; // 追踪是否已经在白名单阶段铸造
    mapping(uint256 => bool) private _tokenIdUsed;
    uint256 private _tokenIds; // 已铸造的token数量

    uint256 public constant MINT_PRICE = 0.00002 ether; //mint 价格   pro:0.05
    uint256 public maxSupply = 2000; // 最大供应量                       pro:2000

    // 销售阶段枚举
    enum SalePhase {
        Stopped,
        Whitelist,
        Public
    }
    SalePhase public salePhase; // 当前销售阶段状态变量

    constructor() ERC721("ChatyN ZHOU", "ZHOU") Ownable(msg.sender) {
        salePhase = SalePhase.Stopped; // 默认开始于暂停阶段

        // 初始化Blast合约的地址
        blastContract = IBlast(0x4300000000000000000000000000000000000002);
        // 将Gas模式设置为可认领
        blastContract.configureClaimableGas();

        setupRole(DEFAULT_ADMIN_ROLE, msg.sender); // 给部署者管理员角色
        setupRole(OPERATOR_ROLE, msg.sender); // 同时给部署者运营角色
    }

    // 设置管理员
    function setupRole(bytes32 role, address account) public onlyOwner {
        _grantRole(role, account);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        virtual
        override(ERC721Enumerable, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    // 查询持地址持有的token id
    function tokensOfOwner(
        address owner
    ) public view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);
        uint256[] memory tokens = new uint256[](tokenCount);
        for (uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        return tokens;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // 设置nft 链接
    function setBaseURI(string memory baseURI) public {
        require(
            hasRole(OPERATOR_ROLE, msg.sender) || owner() == msg.sender,
            "Must have operator role or be owner"
        );
        _baseTokenURI = baseURI;
    }

    // 设置销售阶段
    function setSalePhase(SalePhase phase) external {
        require(
            hasRole(OPERATOR_ROLE, msg.sender) || owner() == msg.sender,
            "Must have operator role or be owner"
        );
        salePhase = phase;
    }

    // 添加地址到白名单
    function addToWhitelist(address[] calldata addresses) external {
        require(
            hasRole(OPERATOR_ROLE, msg.sender) || owner() == msg.sender,
            "Must have operator role or be owner"
        );
        for (uint256 i = 0; i < addresses.length; i++) {
            _whitelist.add(addresses[i]);
        }
    }

    // 从白名单移除地址
    function removeFromWhitelist(address[] calldata addresses) external {
        require(
            hasRole(OPERATOR_ROLE, msg.sender) || owner() == msg.sender,
            "Must have operator role or be owner"
        );
        for (uint256 i = 0; i < addresses.length; i++) {
            _whitelist.remove(addresses[i]);
        }
    }

    // 检查地址是否在白名单中
    function isWhitelisted(address addr) public view returns (bool) {
        return _whitelist.contains(addr);
    }

    // 查询所有白名单
    function getWhitelistAddresses() public view returns (address[] memory) {
        uint256 whitelistCount = _whitelist.length(); // 获取白名单中地址的数量
        address[] memory addresses = new address[](whitelistCount); // 初始化地址数组

        for (uint256 i = 0; i < whitelistCount; i++) {
            addresses[i] = _whitelist.at(i); // 使用EnumerableSet的at方法获取索引处的地址
        }

        return addresses; // 返回地址数组
    }

    // 批量空投
    function batchAirdrop(address[] calldata addresses) external onlyOwner {
        require(_tokenIds < maxSupply, "Exceeds maximum supply"); // 检查是否超过最大供应量

        for (uint256 i = 0; i < addresses.length; i++) {
            uint256 randId = _generateRandomId();
            _tokenIds += 1;
            _mint(addresses[i], randId);
        }
    }

    // 生成随机数
    function _generateRandomId() private returns (uint256) {
        uint256 random = uint256(
            keccak256(
                abi.encodePacked(block.prevrandao, block.timestamp, _tokenIds)
            )
        ) % maxSupply; // 使用 % maxSupply 确保随机数在 0 到 maxSupply-1 之间

        // 确保新生成的随机 ID 还没有被使用
        while (_tokenIdUsed[random]) {
            random =
                uint256(keccak256(abi.encodePacked(random, block.timestamp))) %
                maxSupply;
        }
        _tokenIdUsed[random] = true; // 标记此 ID 为已使用
        return random;
    }

    // 修改mint函数以适应分阶段铸造
    function mint() public payable {
        require(_tokenIds < maxSupply, "Exceeds maximum supply"); // 检查是否超过最大供应量
        require(msg.value == MINT_PRICE, "Incorrect value sent");
        require(salePhase != SalePhase.Stopped, "Not available");

        if (salePhase == SalePhase.Whitelist) {
            require(isWhitelisted(msg.sender), "Not in whitelist");
            require(
                !hasMintedInWhitelist[msg.sender],
                "Already minted in this phase"
            );
            hasMintedInWhitelist[msg.sender] = true;
        }

        uint256 randId = _generateRandomId();
        _tokenIds += 1;
        _mint(msg.sender, randId);
    }

    // 查询剩余可mint的数量
    function remainingSupply() public view returns (uint256) {
        return maxSupply - _tokenIds;
    }

    // 允许合约所有者提取合约中的ETH
    function withdraw() external onlyOwner {
        uint256 balance = address(this).balance;
        require(balance > 0, "No funds available");
        payable(owner()).transfer(balance);
    }

    // 管理员认领Gas费用
    function claimGasFees(address recipient) external onlyOwner {
        // 认领所有累积的Gas费用到指定的接收者
        blastContract.claimAllGas(address(this), recipient);
    }
}
