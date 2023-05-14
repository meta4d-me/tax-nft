// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC721/utils/ERC721HolderUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/token/ERC1155/utils/ERC1155HolderUpgradeable.sol';
import '@openzeppelin/contracts-upgradeable/utils/cryptography/SignatureCheckerUpgradeable.sol';

import './interfaces/IManager.sol';

contract Manager is OwnableUpgradeable, ERC721HolderUpgradeable, ERC1155HolderUpgradeable, IManager {

    uint constant public MAX_SPLIT = 2000;
    uint constant public SPLIT_BASE = 10000;
    uint public globalSplit;

    ITaxNFT public origin;
    ITaxSemiNFT public derivations;


    mapping(uint => StakedNFT) public stakedNFTs;

    mapping(uint => uint) public derivationPrice;

    mapping(address => mapping(uint => bool)) public usedSigNonce;

    function initialize(ITaxNFT _origin, ITaxSemiNFT _derivations) public initializer {
        __Ownable_init_unchained();
        __ERC721Holder_init_unchained();
        __ERC1155Holder_init_unchained();
        globalSplit = 500;
        origin = _origin;
        derivations = _derivations;
    }

    function setSplit(uint _split) public onlyOwner {
        require(_split <= MAX_SPLIT, 'exceed max split');
        globalSplit = _split;
    }

    function stakeTaxNFT(uint tokenId, uint stableTax, uint percentageTax, address[] memory _approvedGames) public {
        require(percentageTax <= globalSplit, 'ill split percentage');

        origin.safeTransferFrom(msg.sender, address(this), tokenId, '');
        stakedNFTs[tokenId] = StakedNFT(msg.sender, stableTax, percentageTax, _approvedGames);

        emit NFTStaked(tokenId, stableTax, percentageTax, _approvedGames);
    }

    // clear all stale status after unstake
    function unstakeTaxNFT(uint tokenId) public {
        require(msg.sender == stakedNFTs[tokenId].holder, 'ill holder');
        delete stakedNFTs[tokenId];
        origin.safeTransferFrom(address(this), msg.sender, tokenId, '');
        emit NFTUnstaked(tokenId);
    }

    function updateTax(uint tokenId, uint stableTax, uint percentageTax) public {
        require(percentageTax <= globalSplit, 'ill split percentage');

        StakedNFT storage stakedNFT = stakedNFTs[tokenId];
        require(msg.sender == stakedNFT.holder, 'ill holder');
        stakedNFT.stableTax = stableTax;
        stakedNFT.percentageTax = percentageTax;

        emit TaxUpdated(tokenId, stableTax, percentageTax);
    }

    // reset approvals wholly
    function updateApproval(uint tokenId, address[] memory newApprovals) public {
        StakedNFT storage stakedNFT = stakedNFTs[tokenId];
        require(msg.sender == stakedNFT.holder, 'ill holder');
        stakedNFT.approvedGames = newApprovals;
        emit ApprovalGamesUpdated(tokenId, newApprovals);
    }

    // game owner should set derivation price before user mint derivation
    function setDerivationPrice(uint derivationTokenId, uint price) public {
        // lower 160bit of derivationTokenId should be same with msg.sender, restrict the derivationTokenId space of the each game
        require(msg.sender == address(uint160(derivationTokenId)), 'ill derivation id');
        derivationPrice[derivationTokenId] = price;

        emit PriceUpdated(derivationTokenId, price);
    }

    // staked Origin NFT set approval to game, or any game(if they don't set any approval)
    // game set price of derivations that own by game self
    // user could mint any derivations that own price
    function mintTaxSemiNFT(uint originTokenId, uint derivationsTokenId, uint amount, uint nonce, bytes memory gameSig) public payable {
        require(origin.ownerOf(originTokenId) == address(this), 'unstake');

        StakedNFT memory stakedNFT = stakedNFTs[originTokenId];
        require(stakedNFT.holder != address(0), 'ill stake');

        address game = address(uint160(derivationsTokenId));
        if (stakedNFT.approvedGames.length > 0) {// check game approval
            bool approval = false;
            for (uint i = 0; i < stakedNFT.approvedGames.length; i++) {
                if (stakedNFT.approvedGames[i] == game) {
                    approval = true;
                    break;
                }
            }
            require(approval, 'ill game approval');
            // check game signature
            require(!usedSigNonce[game][nonce], 'ill sig nonce');
            bytes32 hash = keccak256(abi.encodePacked(msg.sender, originTokenId, derivationsTokenId, amount, nonce));
            require(SignatureCheckerUpgradeable.isValidSignatureNow(game, hash, gameSig), 'ill sig');
            usedSigNonce[game][nonce] = true;
        }

        uint price = derivationPrice[derivationsTokenId];
        uint total = price * amount;
        require(total > 0, 'ill derivation price');
        require(total == msg.value, 'ill value');

        (uint minterStableTax, uint minterPercentageTax) = origin.taxSplit(originTokenId);
        uint minterTax = max(minterStableTax * amount, minterPercentageTax * total / SPLIT_BASE);
        uint holderTax = max(stakedNFT.stableTax * amount, stakedNFT.percentageTax * total / SPLIT_BASE);
        uint gameRevenue = total - minterTax - holderTax;

        /* split revenue */
        payable(origin.minter(originTokenId)).transfer(minterTax);
        payable(stakedNFT.holder).transfer(holderTax);
        payable(game).transfer(gameRevenue);

        // mint derivations
        derivations.mint(msg.sender, derivationsTokenId, amount);

        emit DerivationMinted(originTokenId, derivationsTokenId, price, amount, minterTax, holderTax);
    }

    function approvedGames(uint tokenId) public view returns (address[] memory){
        return stakedNFTs[tokenId].approvedGames;
    }

    function max(uint256 a, uint256 b) internal pure returns (uint256) {
        return a > b ? a : b;
    }
}
