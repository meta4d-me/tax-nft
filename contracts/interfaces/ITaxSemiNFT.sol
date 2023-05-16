// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC1155/IERC1155Upgradeable.sol';

interface ITaxSemiNFT is IERC1155Upgradeable {

    function totalSupply(uint tokenId) external view returns (uint);

    function manager() external view returns (address);

    function burn(address account, uint256 id, uint256 value) external;

    function burnBatch(address account, uint256[] memory ids, uint256[] memory values) external;

    function mint(address to, uint tokenId, uint amount) external;

    function mintBatch(address to, uint[] memory tokenIds, uint[] memory amounts) external;
}
