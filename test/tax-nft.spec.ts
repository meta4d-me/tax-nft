import {ethers, upgrades} from "hardhat";
import {expect} from "chai";
import {Manager, TaxNFT, TaxSemiNFT} from "../typechain-types";
import {BigNumber, Signer} from "ethers";
import {SigningKey} from "@ethersproject/signing-key";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

const env = require('../.env.json');

describe('Tax NFT test', async function () {
    let taxNFT: TaxNFT, taxSemiNFT: TaxSemiNFT, manager: Manager;
    let owner: SignerWithAddress, account: SignerWithAddress, minter: SignerWithAddress;
    let stableTax = ethers.utils.parseEther('0.1');
    let percentageTax = 500;
    let price = ethers.utils.parseEther('1');
    let gameSigningKey: SigningKey, game: string;
    let derivationTokenId: BigNumber;
    let sigNonce = 0;
    let emptySig = Buffer.from('');
    it('deploy', async () => {
        const TaxNFT = await ethers.getContractFactory("TaxNFT");
        taxNFT = await upgrades.deployProxy(TaxNFT, {initializer: false}) as TaxNFT;
        const TaxSemiNFT = await ethers.getContractFactory("TaxSemiNFT");
        taxSemiNFT = await upgrades.deployProxy(TaxSemiNFT, {initializer: false}) as TaxSemiNFT
        const Manager = await ethers.getContractFactory("Manager");
        manager = await upgrades.deployProxy(Manager, {initializer: false}) as Manager;

        await taxNFT.initialize('Tax NFT', 'TNFT', 'ipfs://', manager.address);
        await taxSemiNFT.initialize('ipfs://id', manager.address);
        await manager.initialize(taxNFT.address, taxSemiNFT.address);

        [owner, account, minter] = await ethers.getSigners();
        gameSigningKey = new ethers.utils.SigningKey('0x' + env.PRIVATE_KEY_2);
        game = ethers.utils.computeAddress(gameSigningKey.publicKey);
        derivationTokenId = ethers.BigNumber.from(1).shl(255).add(ethers.BigNumber.from(game));

        await owner.sendTransaction({to: game, value: price.mul(10)});
    });
    it('mint TaxNFT', async () => {
        await taxNFT.mint(owner.address, minter.address, '1');
        const ipfsHashes = ['2', '3', '4'];
        await taxNFT.batchMint(owner.address, minter.address, ipfsHashes);
        expect(await taxNFT.tokenIndex()).to.eq(4);
        expect(await taxNFT.ownerOf(0)).to.eq(owner.address);
        expect(await taxNFT.minter(0)).to.eq(minter.address);
        await taxNFT.connect(minter).setMinterTaxSplit(0, stableTax, percentageTax);
        const splitTax = await taxNFT.taxSplit(0);
        expect(splitTax.stableTax).to.eq(stableTax);
        expect(splitTax.percentageTax).to.eq(percentageTax);
    });
    it('owner cannot mint derivations straightly', async () => {
        await expect(taxSemiNFT.mint(owner.address, 0, 1)).to.be.revertedWith('only manager');
    })
    it('stake TaxNFT', async () => {
        await taxNFT.setApprovalForAll(manager.address, true);
        await manager.stakeTaxNFT(0, stableTax, percentageTax, []);
        // split percentage is too high
        await expect(manager.stakeTaxNFT(1, stableTax, percentageTax + 1, [])).to.be.revertedWith('ill split percentage');
        expect(await taxNFT.ownerOf(0)).to.eq(manager.address);
        const stakedNFT0 = await manager.stakedNFTs(0);
        expect(stakedNFT0.holder).to.eq(owner.address);
        expect(stakedNFT0.stableTax).to.eq(stableTax);
        expect(stakedNFT0.percentageTax).to.eq(percentageTax);
        expect((await manager.approvedGames(0)).length).to.eq(0);
    });
    it('set price', async () => {
        const gameSigner = new ethers.Wallet(gameSigningKey, ethers.provider);
        await manager.connect(gameSigner).setDerivationPrice(derivationTokenId, price);
        expect(await manager.derivationPrice(derivationTokenId)).to.eq(price);
    });
    it('mint derivations when approve any games', async () => {
        let minterBalanceBefore = await ethers.provider.getBalance(minter.address);
        let holderBalanceBefore = await ethers.provider.getBalance(owner.address);
        let gameBalanceBefore = await ethers.provider.getBalance(game);
        await manager.connect(account).mintTaxSemiNFT(0, derivationTokenId, 1, sigNonce, emptySig, {value: price});
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(1);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(stableTax);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(stableTax);
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(stableTax).sub(stableTax));
    });
    it('set approval games', async () => {
        await manager.updateApproval(0, [game]);
        expect((await manager.approvedGames(0))[0]).to.eq(game);
    });
    it('mint derivations when approve to some games', async () => {
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        let minterBalanceBefore = await ethers.provider.getBalance(minter.address);
        let holderBalanceBefore = await ethers.provider.getBalance(owner.address);
        let gameBalanceBefore = await ethers.provider.getBalance(game);
        await manager.connect(account).mintTaxSemiNFT(0, derivationTokenId, 1, sigNonce, sig, {value: price});
        expect(await manager.usedSigNonce(game, sigNonce)).to.eq(true);
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(2);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(stableTax);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(stableTax);
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(stableTax).sub(stableTax));
        sigNonce++;
    });
    it('mint ill derivations when approve to some games', async () => {
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(0, derivationTokenId.add(1), 1,
            sigNonce, sig, {value: price})).to.be.revertedWith('ill game approval');
    });
    it('mint derivations with ill sig when approve to some games', async () => {
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId.add(1), 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(0, derivationTokenId, 1,
            sigNonce, sig, {value: price})).to.be.revertedWith('ill sig');
    });
    it('mint derivations with ill nonce when approve any games', async () => {
        sigNonce--;
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(0, derivationTokenId, 1, sigNonce, sig,
            {value: price})).to.be.revertedWith('ill sig nonce');
        sigNonce++;
    });
    it('increase price, so tax would increase', async () => {
        // increase price
        const gameSigner = new ethers.Wallet(gameSigningKey, ethers.provider);
        price = price.mul(3);
        await manager.connect(gameSigner).setDerivationPrice(derivationTokenId, price);
        expect(await manager.derivationPrice(derivationTokenId)).to.eq(price);

        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        let minterBalanceBefore = await ethers.provider.getBalance(minter.address);
        let holderBalanceBefore = await ethers.provider.getBalance(owner.address);
        let gameBalanceBefore = await ethers.provider.getBalance(game);
        await manager.connect(account).mintTaxSemiNFT(0, derivationTokenId, 1, sigNonce, sig, {value: price});
        expect(await manager.usedSigNonce(game, sigNonce)).to.eq(true);
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(3);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        const tax = price.mul(1).mul(percentageTax).div(10000);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(tax);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(tax);
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(tax).sub(tax));
        sigNonce++;
    });
    it('update stake tax NFT', async () => {
        await manager.updateTax(0, stableTax, percentageTax - 1);
        const stakedNFT0 = await manager.stakedNFTs(0);
        expect(stakedNFT0.percentageTax).to.eq(percentageTax - 1);
    });
    it('unstake tax NFT', async () => {
        await manager.unstakeTaxNFT(0);
        expect(await taxNFT.ownerOf(0)).to.eq(owner.address);
        const stakedNFT0 = await manager.stakedNFTs(0);
        expect(stakedNFT0.holder).to.eq('0x0000000000000000000000000000000000000000');
        expect(stakedNFT0.stableTax).to.eq(0);
        expect(stakedNFT0.percentageTax).to.eq(0);
        expect((await manager.approvedGames(0)).length).to.eq(0);
    });
});