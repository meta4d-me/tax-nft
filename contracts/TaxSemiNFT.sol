// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC1155/ERC1155Upgradeable.sol';
import "./interfaces/ITaxSemiNFT.sol";

contract TaxSemiNFT is ERC1155Upgradeable, ITaxSemiNFT {
    address public manager;

    function initialize(string memory uri, address _manager) public initializer {
        __ERC1155_init_unchained(uri);
        manager = _manager;
    }

    function mint(address to, uint tokenId, uint amount) public override {
        require(msg.sender == manager, 'only manager');
        _mint(to, tokenId, amount, '');
    }
}
