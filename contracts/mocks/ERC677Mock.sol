// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "@openzeppelin/contracts-upgradeable/presets/ERC20PresetMinterPauserUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";

contract ERC677Mock is ERC20PresetMinterPauserUpgradeable {
    using AddressUpgradeable for address;

    address private bridge;

    function initialize(
        string memory name,
        string memory symbol,
        uint256 initialSupply,
        address initialHolder,
        address[] memory minters,
        address[] memory pausers,
        address _bridge
    ) public initializer {

        __ERC20PresetMinterPauser_init(name, symbol);

        _mint(initialHolder, initialSupply);

        for (uint256 i = 0; i < minters.length; ++i) {
            grantRole(ERC20PresetMinterPauserUpgradeable.MINTER_ROLE, minters[i]);
        }

        for (uint256 i = 0; i < pausers.length; ++i) {
            grantRole(ERC20PresetMinterPauserUpgradeable.PAUSER_ROLE, minters[i]);
        }

        bridge = _bridge;
    }

    function removeMinter(address _account) external {
        revokeRole(ERC20PresetMinterPauserUpgradeable.MINTER_ROLE, _account);
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        bool success = super.transfer(recipient, amount);
        require(success, "transfer failed");
        return true;
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        bool success = super.transferFrom(sender, recipient, amount);
        require(success, "transfer failed");
        return true;
    }
}
