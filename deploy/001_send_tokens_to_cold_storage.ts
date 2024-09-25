import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {CENTRALEX_TOKEN, COLD_STORAGE} from './constants';
import {BigNumber} from "ethers";

const oneEther = BigNumber.from(1).mul(BigNumber.from(10).pow(18));

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {getNamedAccounts, deployments} = hre;
    const {execute} = deployments;

    const {deployer} = await getNamedAccounts();

    console.log('Sending 500,000,00 tokens from deployer to cold storage: ' + COLD_STORAGE);
    await execute(
        CENTRALEX_TOKEN,
        {
            from: deployer,
            log: true
        },
        'transfer',
        COLD_STORAGE,
        oneEther.mul(500000000)
    );
};

export default func;

func.tags = [CENTRALEX_TOKEN];
