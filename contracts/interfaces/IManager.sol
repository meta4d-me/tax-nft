// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;


import './ITaxNFT.sol';
import './ITaxSemiNFT.sol';

interface IManager {

    event NFTStaked(uint indexed tokenId, uint initStableTax, uint initPercentageTax, address[] approvedGames);
    event NFTUnstaked(uint indexed tokenId);
    event TaxUpdated(uint indexed tokenId, uint stableTax, uint percentageTax);
    event ApprovalGamesUpdated(uint indexed tokenId, address[] games);
    event PriceUpdated(uint indexed derivationTokenId, uint price);
    event DerivationMinted(uint indexed originTokenId, uint indexed derivationId, uint price, uint amount, uint minterTax, uint holderTax);

    function globalSplit() external view returns (uint);

    function origin() external view returns (ITaxNFT);

    function derivations() external view returns (ITaxSemiNFT);

    struct StakedNFT {
        address holder;
        uint stableTax;
        uint percentageTax;
        address[] approvedGames;
    }

    function stakedNFTs(uint tokenId) external view returns (address, uint, uint);

    function approvedGames(uint tokenId) external view returns (address[] memory);

    function derivationPrice(uint tokenId) external view returns (uint price);

    function usedSigNonce(address game, uint nonce) external view returns (bool);

    function stakeTaxNFT(uint tokenId, uint stableTax, uint percentageTax, address[] memory _approvedGames) external;

    function unstakeTaxNFT(uint tokenId) external;

    function updateTax(uint tokenId, uint stableTax, uint percentageTax) external;

    function updateApproval(uint tokenId, address[] memory newApprovals) external;

    function setDerivationPrice(uint derivationTokenId, uint price) external;

    function mintTaxSemiNFT(uint originTokenId, uint derivationsTokenId, uint amount, uint nonce, bytes memory gameSig) external payable;
}
