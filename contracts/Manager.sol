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
    uint public holderSplit;
    uint public minterSplit;

    ITaxNFT public origin;
    ITaxSemiNFT public derivative;

    mapping(uint => address) public holders;

    mapping(uint => address[]) internal approvedGamesInternal;

    mapping(uint => uint) public derivationPrice;

    // derivation tokenId => origin tokenId
    mapping(uint => uint) public derivationBind;

    // game => nonce => bool
    mapping(address => mapping(uint => bool)) public usedSigNonce;
    // user => derivationId => amount
    mapping(address => mapping(uint => uint)) public rolledInDerivations;

    function initialize(ITaxNFT _origin, ITaxSemiNFT _derivative) public initializer {
        __Ownable_init_unchained();
        __ERC721Holder_init_unchained();
        __ERC1155Holder_init_unchained();
        holderSplit = 100;
        minterSplit = 100;
        origin = _origin;
        derivative = _derivative;
    }

    function setSplit(uint _holder, uint _minter) public onlyOwner {
        require(_holder <= MAX_SPLIT && _minter <= MAX_SPLIT, 'exceed max split');
        holderSplit = _holder;
        minterSplit = _minter;

        emit SplitUpdate(_holder, _minter);
    }

    function stakeTaxNFT(uint tokenId, address[] memory _approvedGames) public {
        origin.safeTransferFrom(msg.sender, address(this), tokenId, '');
        holders[tokenId] = msg.sender;
        approvedGamesInternal[tokenId] = _approvedGames;

        emit NFTStaked(tokenId, msg.sender, _approvedGames);
    }

    // clear all stale status after unstake
    function unstakeTaxNFT(uint tokenId) public {
        require(msg.sender == holders[tokenId], 'ill holder');
        delete holders[tokenId];
        delete approvedGamesInternal[tokenId];
        origin.safeTransferFrom(address(this), msg.sender, tokenId, '');
        emit NFTUnstaked(tokenId);
    }

    // reset approvals wholly
    function updateApproval(uint tokenId, address[] memory newApprovals) public {
        require(msg.sender == holders[tokenId], 'ill holder');
        approvedGamesInternal[tokenId] = newApprovals;
        emit ApprovalGamesUpdated(tokenId, newApprovals);
    }

    // game owner should set derivation price before user mint derivation
    function setDerivationPrice(uint derivationTokenId, uint price) public {
        // lower 160bit of derivationTokenId should be same with msg.sender, restrict the derivationTokenId space of the each game
        require(msg.sender == address(uint160(derivationTokenId)), 'ill derivation id');
        derivationPrice[derivationTokenId] = price;

        emit PriceUpdated(derivationTokenId, price);
    }

    function bindDerivation(uint derivationTokenId, uint originTokenId) public {
        require(msg.sender == address(uint160(derivationTokenId)), 'ill derivation id');
        derivationBind[derivationTokenId] = originTokenId;

        emit DerivationBind(derivationTokenId, originTokenId);
    }

    // staked Origin NFT set approval to game, or any game(if they don't set any approval)
    // game set price of derivations that own by game self
    // user could mint any derivations that own price
    function mintTaxSemiNFT(uint derivationsTokenId, uint amount, uint nonce, bytes memory gameSig) public payable {
        uint originTokenId = derivationBind[derivationsTokenId];
        require(origin.ownerOf(originTokenId) == address(this), 'unstake');

        address holder = holders[originTokenId];
        require(holder != address(0), 'ill stake');

        address game = address(uint160(derivationsTokenId));
        if (approvedGamesInternal[originTokenId].length > 0) {// check game approval
            checkApprove(approvedGamesInternal[originTokenId], game);
        }
        // check game signature
        require(!usedSigNonce[game][nonce], 'ill sig nonce');
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, originTokenId, derivationsTokenId, amount, nonce));
        require(SignatureCheckerUpgradeable.isValidSignatureNow(game, hash, gameSig), 'ill sig');
        usedSigNonce[game][nonce] = true;

        payable(game).transfer(settleMintFee(derivationsTokenId, amount));
        // mint derivations
        derivative.mint(msg.sender, derivationsTokenId, amount);
    }

    function rollIn(uint[] memory derivationIds, uint[] memory amounts, address game) public {
        // check approval
        checkDerivations(derivationIds, game);

        derivative.burnBatch(msg.sender, derivationIds, amounts);

        for (uint i = 0; i < derivationIds.length; i++) {
            rolledInDerivations[msg.sender][derivationIds[i]] += amounts[i];
        }

        emit RollIn(msg.sender, game, derivationIds, amounts);
    }

    function rollOut(address game, uint[] memory derivationIds, uint[] memory amounts, uint nonce, bytes memory gameSig) public payable {
        // check sig
        require(!usedSigNonce[game][nonce], 'ill sig nonce');
        bytes32 hash = keccak256(abi.encodePacked(msg.sender, derivationIds, amounts, nonce));
        require(SignatureCheckerUpgradeable.isValidSignatureNow(game, hash, gameSig), 'ill sig');
        usedSigNonce[game][nonce] = true;
        // check approval
        checkDerivations(derivationIds, game);
        uint gameRevenue = 0;
        // pay
        for (uint i = 0; i < derivationIds.length; i++) {
            uint rolledInAmount = rolledInDerivations[msg.sender][derivationIds[i]];
            if (amounts[i] <= rolledInAmount) {
                rolledInDerivations[msg.sender][derivationIds[i]] -= amounts[i];
            } else {// settle fee
                gameRevenue += settleMintFee(derivationIds[i], amounts[i] - rolledInAmount);
                rolledInDerivations[msg.sender][derivationIds[i]] = 0;
            }
        }
        // mint
        derivative.mintBatch(msg.sender, derivationIds, amounts);

        payable(game).transfer(gameRevenue);

        emit RollOut(msg.sender, game, derivationIds, amounts);
    }

    function settleMintFee(uint derivationId, uint amount) internal returns (uint gameRevenue){
        uint price = derivationPrice[derivationId];
        uint total = price * amount;
        uint minterTax = minterSplit * total / SPLIT_BASE;
        uint holderTax = holderSplit * total / SPLIT_BASE;
        gameRevenue += total - minterTax - holderTax;

        uint originTokenId = derivationBind[derivationId];
        payable(origin.minter(originTokenId)).transfer(minterTax);
        payable(holders[originTokenId]).transfer(holderTax);

        emit DerivationMinted(originTokenId, derivationId, price, amount, minterTax, holderTax);
    }

    /// @notice require 1. originToken should be staked; 2. derivation's game should be approved by originToken
    function checkDerivations(uint[] memory derivationsIds, address game) internal view {
        for (uint i = 0; i < derivationsIds.length; i++) {
            uint originTokenId = derivationBind[derivationsIds[i]];
            // check NFT is staked
            require(holders[originTokenId] != address(0), 'origin NFT is not staked');
            // check self derivation
            if (address(uint160(derivationsIds[i])) == game) {
                continue;
            }
            // check approve
            if (approvedGamesInternal[originTokenId].length > 0) {
                checkApprove(approvedGamesInternal[originTokenId], game);
            }
        }
    }

    function checkApprove(address[] memory _approvedGames, address game) internal pure {
        bool approval = false;
        for (uint i = 0; i < _approvedGames.length; i++) {
            if (_approvedGames[i] == game) {
                approval = true;
                break;
            }
        }
        require(approval, 'ill game approval');
    }

    function approvedGames(uint tokenId) external view returns (address[] memory){
        return approvedGamesInternal[tokenId];
    }
}
