// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "../Staking.sol";

contract StakingMock is Staking {
    receive() external payable {
    }
}
