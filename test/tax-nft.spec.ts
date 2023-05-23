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
    let price = ethers.utils.parseEther('1');
    let minterSplit = price.div(100);
    let holderSplit = price.div(100);
    let gameSigningKey: SigningKey, game: string;
    let otherGameKey: SigningKey, otherGame: string, otherDerivationTokenId: BigNumber;
    let derivationTokenId: BigNumber;
    let sigNonce = 0;
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
    });
    it('owner cannot mint derivations straightly', async () => {
        await expect(taxSemiNFT.mint(owner.address, 0, 1)).to.be.revertedWith('only manager');
    })
    it('stake TaxNFT', async () => {
        await taxNFT.setApprovalForAll(manager.address, true);
        await manager.stakeTaxNFT(0, []);
        expect(await taxNFT.ownerOf(0)).to.eq(manager.address);
        expect(await manager.holders(0)).to.eq(owner.address);
        expect((await manager.approvedGames(0)).length).to.eq(0);
    });
    it('set price & bind origin', async () => {
        const gameSigner = new ethers.Wallet(gameSigningKey, ethers.provider);
        await manager.connect(gameSigner).setDerivationPrice(derivationTokenId, price);
        expect(await manager.derivationPrice(derivationTokenId)).to.eq(price);
        await manager.connect(gameSigner).bindDerivation(derivationTokenId, 0);
        expect(await manager.derivationBind(derivationTokenId)).to.eq(0);
    });
    it('mint derivations when approve any games', async () => {
        let minterBalanceBefore = await ethers.provider.getBalance(minter.address);
        let holderBalanceBefore = await ethers.provider.getBalance(owner.address);
        let gameBalanceBefore = await ethers.provider.getBalance(game);
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await manager.connect(account).mintTaxSemiNFT(derivationTokenId, 1, sigNonce, sig, {value: price});
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(1);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(minterSplit);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(holderSplit);
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(minterSplit).sub(holderSplit));
        sigNonce++;
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
        await manager.connect(account).mintTaxSemiNFT(derivationTokenId, 1, sigNonce, sig, {value: price});
        expect(await manager.usedSigNonce(game, sigNonce)).to.eq(true);
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(2);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(minterSplit);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(holderSplit);
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(minterSplit).sub(holderSplit));
        sigNonce++;
    });
    it('mint ill derivations when approve to some games', async () => {
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(derivationTokenId.add(1), 1,
            sigNonce, sig, {value: price})).to.be.revertedWith('ill game approval');
    });
    it('mint derivations with ill sig when approve to some games', async () => {
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId.add(1), 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(derivationTokenId, 1,
            sigNonce, sig, {value: price})).to.be.revertedWith('ill sig');
    });
    it('mint derivations with ill nonce when approve any games', async () => {
        sigNonce--;
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint', 'uint', 'uint', "uint"],
                [account.address, 0, derivationTokenId, 1, sigNonce])]);
        let sig = ethers.utils.joinSignature(await gameSigningKey.signDigest(hash));
        await expect(manager.connect(account).mintTaxSemiNFT(derivationTokenId, 1, sigNonce, sig,
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
        await manager.connect(account).mintTaxSemiNFT(derivationTokenId, 1, sigNonce, sig, {value: price});
        expect(await manager.usedSigNonce(game, sigNonce)).to.eq(true);
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(3);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(minterSplit.mul(3));
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(holderSplit.mul(3));
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(price.mul(1).sub(minterSplit.add(holderSplit).mul(3)));
        sigNonce++;
    });
    it('roll in', async () => {
        await manager.connect(account).rollIn([derivationTokenId], [3], game)
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(0);
        expect(await taxSemiNFT.balanceOf(manager.address, derivationTokenId)).to.eq(0);
        expect(await manager.rolledInDerivations(account.address, derivationTokenId)).to.eq(3);
    })
    it('restore price', async () => {
        const gameSigner = new ethers.Wallet(gameSigningKey, ethers.provider);
        price = ethers.utils.parseEther('1');
        await manager.connect(gameSigner).setDerivationPrice(derivationTokenId, price);
    });
    it('prepare new derivation', async () => {
        otherGameKey = new ethers.utils.SigningKey('0x' + env.PRIVATE_KEY_3);
        otherGame = ethers.utils.computeAddress(otherGameKey.publicKey);
        otherDerivationTokenId = ethers.BigNumber.from(1).shl(255).add(ethers.BigNumber.from(otherGame));
        await owner.sendTransaction({to: otherGame, value: price.mul(10)});
        const gameSigner = new ethers.Wallet(otherGameKey, ethers.provider);
        // update game approval
        await manager.updateApproval(0, [game, otherGame]);
        await manager.connect(gameSigner).setDerivationPrice(otherDerivationTokenId, price);
        await manager.connect(gameSigner).bindDerivation(otherDerivationTokenId, 0);
    });
    it('roll out', async () => {
        let derivationIds = [derivationTokenId, otherDerivationTokenId];
        let amounts = [4, 2];
        let hash = ethers.utils.solidityKeccak256(['bytes'],
            [ethers.utils.solidityPack(['address', 'uint[2]', 'uint[2]', 'uint'],
                [account.address, derivationIds, amounts, sigNonce])]);
        let sig = ethers.utils.joinSignature(await otherGameKey.signDigest(hash));
        let minterBalanceBefore = await ethers.provider.getBalance(minter.address);
        let holderBalanceBefore = await ethers.provider.getBalance(owner.address);
        let gameBalanceBefore = await ethers.provider.getBalance(game);
        let otherGameBalanceBefore = await ethers.provider.getBalance(otherGame);
        let totalTax = price.mul(3); // mint 1 new derivation, 2 new other derivation
        await manager.connect(account).rollOut(otherGame, derivationIds, amounts, sigNonce, sig, {value: totalTax});
        expect(await taxSemiNFT.balanceOf(account.address, derivationTokenId)).to.eq(4);
        expect(await taxSemiNFT.balanceOf(manager.address, derivationTokenId)).to.eq(0);
        expect(await taxSemiNFT.balanceOf(account.address, otherDerivationTokenId)).to.eq(2);
        expect(await taxSemiNFT.balanceOf(manager.address, otherDerivationTokenId)).to.eq(0);
        let minterBalanceAfter = await ethers.provider.getBalance(minter.address);
        let holderBalanceAfter = await ethers.provider.getBalance(owner.address);
        let gameBalanceAfter = await ethers.provider.getBalance(game);
        let otherGameBalanceAfter = await ethers.provider.getBalance(otherGame);
        let minterTax = minterSplit.mul(3);
        let holderTax = holderSplit.mul(3);
        expect(minterBalanceAfter.sub(minterBalanceBefore)).to.eq(minterTax);
        expect(holderBalanceAfter.sub(holderBalanceBefore)).to.eq(holderTax);
        // game receive 1 derivation fee
        expect(gameBalanceAfter.sub(gameBalanceBefore)).to.eq(0);
        // other game receive 2 other derivation fee
        expect(otherGameBalanceAfter.sub(otherGameBalanceBefore)).to.eq(totalTax.sub(minterTax).sub(holderTax));
    });
    it('unstake tax NFT', async () => {
        await manager.unstakeTaxNFT(0);
        expect(await taxNFT.ownerOf(0)).to.eq(owner.address);
        expect(await manager.holders(0)).to.eq('0x0000000000000000000000000000000000000000');
        expect((await manager.approvedGames(0)).length).to.eq(0);
    });
});