// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC721/IERC721Upgradeable.sol';

interface ITaxNFT is IERC721Upgradeable {

    function manager() external view returns (address);

    function minter(uint tokenId) external view returns (address);

    function tokenIpfsHash(uint tokenId) external view returns (string memory);

    function taxSplit(uint tokenId) external view returns (uint stable, uint percentage);

    function mint(address to, address _minter, string memory ipfsHash) external;

    function batchMint(address to, address _minter, string[] memory ipfsHashes) external;

    function setMinterBatchTaxSplit(uint[] memory tokenIds, uint stableTax, uint percentageTax) external;
}
