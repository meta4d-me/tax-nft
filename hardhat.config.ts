import {HardhatUserConfig} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

import '@openzeppelin/hardhat-upgrades';

const env = require('./.env.json');

const PRIV_1 = env.PRIVATE_KEY_1;
const PRIV_2 = env.PRIVATE_KEY_2;
const PRIV_3 = env.PRIVATE_KEY_3;
const config: HardhatUserConfig = {
    solidity: "0.8.18",
    networks: {
        mainnet: {
            url: `https://mainnet.infura.io/v3/${env.INFURA}`,
            accounts: [`0x${PRIV_1}`, `0x${PRIV_2}`, `0x${PRIV_3}`]
        },
        mumbai: {
            url: `https://polygon-mumbai.g.alchemy.com/v2/${env.ALCHEMY}`,
            accounts: [`0x${PRIV_1}`, `0x${PRIV_2}`, `0x${PRIV_3}`]
        }
    }
};

export default config;
