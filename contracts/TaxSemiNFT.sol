// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol';
import "./interfaces/ITaxSemiNFT.sol";

contract TaxSemiNFT is ERC1155Upgradeable, ITaxSemiNFT {
    address public manager;
    mapping(uint => uint) public override totalSupply;

    function initialize(string memory uri, address _manager) public initializer {
        __ERC1155_init_unchained(uri);
        manager = _manager;
    }

    function burn(address account, uint256 id, uint256 value) public override {
        require(account == _msgSender() || isApprovedForAll(account, _msgSender()) || _msgSender() == manager, "caller is not owner|manager nor approved");

        totalSupply[id] -= value;
        _burn(account, id, value);
    }

    function burnBatch(address account, uint256[] memory ids, uint256[] memory values) public override {
        require(account == _msgSender() || isApprovedForAll(account, _msgSender()) || _msgSender() == manager, "caller is not owner|manager nor approved");
        for (uint i = 0; i < values.length; i++) {
            totalSupply[ids[i]] -= values[i];
        }
        _burnBatch(account, ids, values);
    }

    function mint(address to, uint tokenId, uint amount) public override {
        require(msg.sender == manager, 'only manager');
        _mint(to, tokenId, amount, '');
        totalSupply[tokenId] += amount;
    }

    function mintBatch(address to, uint[] memory tokenIds, uint[] memory amounts) public override {
        require(msg.sender == manager, 'only manager');
        for (uint256 i = 0; i < tokenIds.length; i++) {
            totalSupply[tokenIds[i]] += amounts[i];
        }
        _mintBatch(to, tokenIds, amounts, '');
    }
}
