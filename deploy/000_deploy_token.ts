import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {CENTRALEX_TOKEN} from './constants';

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
    const {deployments, getNamedAccounts} = hre;
    const {deploy, log} = deployments;

    const {deployer} = await getNamedAccounts();

    log('Deploying Token Contract from ' + deployer + "....");
    await deploy(CENTRALEX_TOKEN, {
        from: deployer,
        log: true,
    });
};

export default func;

func.tags = [CENTRALEX_TOKEN];
