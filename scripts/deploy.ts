import {ethers, upgrades} from "hardhat";
import {Manager, TaxNFT, TaxSemiNFT} from "../typechain-types";

async function deploy() {
    const TaxNFT = await ethers.getContractFactory("TaxNFT");
    const taxNFT = await upgrades.deployProxy(TaxNFT, {initializer: false}) as TaxNFT;
    console.log('TaxNFT deploy at: ', taxNFT.address);
    const TaxSemiNFT = await ethers.getContractFactory("TaxSemiNFT");
    const taxSemiNFT = await upgrades.deployProxy(TaxSemiNFT, {initializer: false}) as TaxSemiNFT
    console.log('TaxSemiNFT deploy at: ', taxSemiNFT.address);
    const Manager = await ethers.getContractFactory("Manager");
    const manager = await upgrades.deployProxy(Manager, {initializer: false}) as Manager;
    console.log('Manager deploy at: ', manager.address);

    console.log('deploy tx awaiting...');
    await taxNFT.deployed();
    await taxSemiNFT.deployed();
    await manager.deployed();

    let tx = await taxNFT.initialize('Tax NFT', 'TNFT', 'ipfs://', manager.address);
    console.log('TaxNFT init: %s', tx.hash);
    tx = await taxSemiNFT.initialize('ipfs://id', manager.address);
    console.log('TaxSemiNFT init: %s', tx.hash);
    tx = await manager.initialize(taxNFT.address, taxSemiNFT.address);
    console.log('Manager init: %s', tx.hash);
    return {taxNFT, taxSemiNFT, manager};
}

deploy().then((res) => {
    process.exit(0);
}).catch(e => {
    console.log(e)
    process.exit(1);
});
