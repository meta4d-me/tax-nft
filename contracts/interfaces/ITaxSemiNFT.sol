// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';

interface ITaxSemiNFT is IERC1155Upgradeable {

    function manager() external view returns (address);

    function mint(address to, uint tokenId, uint amount) external;
}
