import {HardhatUserConfig} from 'hardhat/config';
import environment from './config';

import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-etherscan';

import 'hardhat-typechain';

import 'hardhat-deploy';
import 'hardhat-deploy-ethers';

import 'solidity-coverage';

const config: HardhatUserConfig = {
    solidity: {
        version: "0.7.0",
        settings: {
            optimizer: {
                enabled: true,
            },
        },
    },
    paths: {
        root: './',
        sources: './contracts',
        tests: './test',
        cache: './cache',
        artifacts: './artifacts',
    },
    defaultNetwork: 'rinkeby',
    networks: {
        rinkeby: {
            url: "https://eth-rinkeby.alchemyapi.io/v2/" + environment.alchemyRinkebyKey,
            chainId: 4,
            accounts: [
                environment.privateKey
            ]
        },
    },
    namedAccounts: {
        deployer: {
            hardhat: "0xE1Fd9C89D409c38A369B3aE7984B333DED407B07",
            default: "0xE1Fd9C89D409c38A369B3aE7984B333DED407B07",
            rinkeby: '0xE1Fd9C89D409c38A369B3aE7984B333DED407B07',
            ropsten: '0xE1Fd9C89D409c38A369B3aE7984B333DED407B07',
        },
        admin: {
            default: 0,
            ropsten: '0xE1Fd9C89D409c38A369B3aE7984B333DED407B07',
        },
        proxyOwner: 1,
    },
    etherscan: {
        apiKey: environment.etherScanKey,
    },
};

export default config;
