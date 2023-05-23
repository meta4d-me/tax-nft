// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.18;

import '@openzeppelin/contracts-upgradeable/token/ERC721/ERC721Upgradeable.sol';
import '@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol';

import './interfaces/ITaxNFT.sol';
import './interfaces/IManager.sol';

contract TaxNFT is ITaxNFT, OwnableUpgradeable, ERC721Upgradeable {

    string private baseURI;
    mapping(uint => string) public tokenIpfsHash;
    mapping(uint => address) public minter;
    uint public tokenIndex;

    address public manager;

    function initialize(string memory name, string memory symbol, string memory _baseURI, address _manager) public initializer {
        __ERC721_init_unchained(name, symbol);
        __Ownable_init_unchained();
        baseURI = _baseURI;
        manager = _manager;
    }

    function mint(address to, address _minter, string memory ipfsHash) public onlyOwner {
        uint tokenId = tokenIndex;
        _safeMint(to, tokenId);

        tokenIpfsHash[tokenId] = ipfsHash;
        minter[tokenId] = _minter;

        tokenIndex++;
    }

    function batchMint(address to, address _minter, string[] memory ipfsHashes) public onlyOwner {
        uint tokenId = tokenIndex;
        for (uint i = 0; i < ipfsHashes.length; i++) {
            _safeMint(to, tokenId);

            tokenIpfsHash[tokenId] = ipfsHashes[i];
            minter[tokenId] = _minter;
            tokenId++;
        }


        tokenIndex = tokenId;
    }

    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        return string(abi.encodePacked(baseURI, tokenIpfsHash[tokenId]));
    }
}
