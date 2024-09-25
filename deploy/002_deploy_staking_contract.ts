import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {
    FEE,
    OWNER,
    REWARD_MATURITY_DURATION,
    REWARD_SHARE_PERCENT,
    STAKING,
    TOKEN_ADDRESS,
    WITHDRAWAL_LOCK_DURATION,
    WITHDRAWAL_UNLOCK_DURATION
} from './constants';
import {BigNumber} from "ethers";

const oneEther = BigNumber.from(1).mul(BigNumber.from(10).pow(18));

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, log} = deployments;

    const {deployer} = await getNamedAccounts();

    log('Deploying Staking contract from ' + deployer + "....");
    await deploy(STAKING, {
        from: deployer,
        log: true,
        args: [
            OWNER,
            TOKEN_ADDRESS,
            FEE,
            WITHDRAWAL_LOCK_DURATION,
            WITHDRAWAL_UNLOCK_DURATION,
            REWARD_MATURITY_DURATION,
            REWARD_SHARE_PERCENT
        ]
    });
};

export default func;

func.tags = [STAKING];
