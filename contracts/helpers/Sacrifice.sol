// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

contract Sacrifice {
    constructor(address payable _recipient) payable {
        selfdestruct(_recipient);
    }
}
