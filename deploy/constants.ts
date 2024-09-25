import {HardhatRuntimeEnvironment} from 'hardhat/types';
import {DeployFunction} from 'hardhat-deploy/types';
import {BigNumber} from "ethers";

export const CENTRALEX_TOKEN = 'CentralexToken';
export const STAKING = "Staking";

export const OWNER = "0x9Fed225115A1374c7F0FaeF307D471c80fff1893";
export const TOKEN_ADDRESS = "0x9Fed225115A1374c7F0FaeF307D471c80fff1893";
export const FEE = BigNumber.from(3);
export const WITHDRAWAL_LOCK_DURATION = BigNumber.from(3);
export const WITHDRAWAL_UNLOCK_DURATION = BigNumber.from(3);
export const REWARD_MATURITY_DURATION = BigNumber.from(3);
export const REWARD_SHARE_PERCENT = BigNumber.from(3);

export const COLD_STORAGE = "0x9Fed225115A1374c7F0FaeF307D471c80fff1893";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
};

export default func;
