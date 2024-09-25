// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";

import "./helpers/Sacrifice.sol";
import "./CentralexToken.sol";

/**
 * @title Compound reward staking
 *
 * Note: all percentage values are between 0 (0%) and 1 (100%)
 * and represented as fixed point numbers containing 18 decimals like with Ether
 * 100% == 1 ether
 */
contract Staking is OwnableUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable {
    using AddressUpgradeable for address;
    using SafeMathUpgradeable for uint256;
    using SafeERC20Upgradeable for IERC20Upgradeable;

    /**
     * @dev Emitted when a user deposits tokens.
     * @param sender User address.
     * @param id User's unique deposit ID.
     * @param amount The amount of deposited tokens.
     * @param userBalance Current user balance.
     * @param reward User's reward.
     * @param prevDepositDuration Duration of the previous deposit in seconds.
     * @param currentRewardFactor Factor to calculate reward.
     * @param totalStaked Total staked amount.
     */
    event Deposited(
        address indexed sender,
        uint256 indexed id,
        uint256 amount,
        uint256 userBalance,
        uint256 reward,
        uint256 prevDepositDuration,
        uint256 currentRewardFactor,
        uint256 totalStaked
    );

    /**
     * @dev Emitted when a user requests withdrawal.
     * @param sender User address.
     * @param id User's unique deposit ID.
     */
    event WithdrawalRequested(address indexed sender, uint256 indexed id);

    /**
     * @dev Emitted when deposit and reward are calculated before withdrawal.
     * @param sender User address.
     * @param id User's unique deposit ID.
     * @param deposit Removed deposit.
     * @param reward Assigned reward.
     */
    event BeforeDepositAndRewardWithdrawn(
        address indexed sender,
        uint256 indexed id,
        uint256 deposit,
        uint256 reward
    );

    /**
     * @dev Emitted when a user withdraws tokens.
     * @param sender User address.
     * @param id User's unique deposit ID.
     * @param withdrawalSum The amount of withdrawn tokens.
     * @param fee The withdrawal fee.
     * @param balance Current user balance.
     * @param reward User's reward assigned.
     * @param lastDepositDuration Duration of the last deposit in seconds.
     * @param totalStaked Total staked amount updated.
     * @param totalRemainingReward Total remaining reward which changes after someone withdraws his reward.
     */
    event Withdrawn(
        address indexed sender,
        uint256 indexed id,
        uint256 withdrawalSum,
        uint256 fee,
        uint256 balance,
        uint256 reward,
        uint256 lastDepositDuration,
        uint256 totalStaked,
        uint256 totalRemainingReward
    );

    /**
     * @dev Emitted when a new fee value is set.
     * @param value A new fee value.
     * @param sender The owner address at the moment of fee changing.
     */
    event FeeSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new reward distribution set.
     * @param value A new distribution ration value.
     * @param sender The owner address at the moment of ratio changing.
     */
    event RewardDistributionSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new reward maturity duration set.
     * @param value A new time in seconds.
     * @param sender The owner address at the time of changing.
     */
    event RewardMaturityDurationSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new withdrawal lock duration value is set.
     * @param value A new withdrawal lock duration value.
     * @param sender The owner address at the moment of value changing.
     */
    event WithdrawalLockDurationSet(uint256 value, address sender);

    /**
     * @dev Emitted when a new withdrawal unlock duration value is set.
     * @param value A new withdrawal unlock duration value.
     * @param sender The owner address at the moment of value changing.
     */
    event WithdrawalUnlockDurationSet(uint256 value, address sender);

    /**
     * @dev Emitted when a request to distribute the reward.
     * @param amount A reward received.
     */
    event RewardDistributed(
        uint256 amount
    );

    /**
     * @dev Emitted when a request to distribute the reward.
     * @param rewardFactor.
     * @param totalStaked - All staked amount
     */
    event RewardFactorUpdated(
        uint256 rewardFactor,
        uint256 totalStaked
    );

    /**
     * @dev Emitted when reward has been updated.
     * @param stakersReward - Added stakers reward
     * @param ownerReward - Added owner reward
     * @param totalRemainingReward - Total remaining reward which cnanges when reward is accrued and withdrawn
     * @param totalStakersReward - Total stakers reward value
     * @param totalOnwerReward - Total onwer reward value
     */
    event RewardUpdated(
        uint256 stakersReward,
        uint256 ownerReward,
        uint256 totalRemainingReward,
        uint256 totalStakersReward,
        uint256 totalOnwerReward
    );

    struct UintParam {
        uint256 oldValue;
        uint256 newValue;
        uint256 timestamp;
    }

    struct AddressParam {
        address oldValue;
        address newValue;
        uint256 timestamp;
    }

    // uint256 constant PPB = 10**9;
    // Withdrawal fee, in parts per billion.
    // uint256 constant FEE_RATIO_PPB = 30 * PPB / 1000; // 3.0%
    // The maximum emission rate (in percentage)
    // uint256 public constant MAX_EMISSION_RATE = 15 * 1e16 wei; // 15%, 0.15 ether

    // uint256 private constant YEAR = 365 days;

    // The period after which the new value of the parameter is set
    uint256 public constant PARAM_UPDATE_DELAY = 7 days;

    // The reward factor of the staker(j) = SUM ( reward(j) / SUM(stakes(0->N))
    uint256 private currentRewardFactor = 0;

    // Saves the value of S at the time the participant j makes a deposit.
    mapping (address => mapping (uint256 => uint256)) public depositRewardFactor;

    // CenX token
    CentralexToken public token;

    // The fee of the forced withdrawal (in percentage)
    UintParam public feeParam;
    // The reward distribution (in percentage) fot stakeholders, i.e. 25% for the first year
    UintParam public rewardSharePercentParam;
    // The time from the request after which the withdrawal will be available (in seconds)
    UintParam public withdrawalLockDurationParam;
    // The time during which the withdrawal will be available from the moment of unlocking (in seconds)
    UintParam public withdrawalUnlockDurationParam;
    // The time during which the reward will be available to withdraw only partially depending on the deposit duration (in seconds)
    UintParam public rewardMaturityDurationParam;


    /// @notice The deposit balances of users
    mapping (address => mapping (uint256 => uint256)) public balances;
    /// @notice  The dates of users' deposits
    mapping (address => mapping (uint256 => uint256)) public depositDates;
    /// @notice  The dates of users' withdrawal requests
    mapping (address => mapping (uint256 => uint256)) public withdrawalRequestsDates;
    /// @notice  The last deposit id
    mapping (address => uint256) public lastDepositIds;
    /// @notice  The total staked amount
    uint256 public totalStaked;
    /// @notice The total remaining reward. Changes when user withdraws and when reward is distributed to stakeholders.
    uint256 public totalRemainingReward;
    /// @notice The total reward received by stakeholders.
    uint256 public totalStakersReward;
    /// @notice The total Cetralex reward. To be transfered back to CenX Token or liquidity providers.
    uint256 public totalOnwerReward;

    /**
     * @dev Initializes the contract.
     * @param _owner The owner of the contract.
     * @param _tokenAddress The address of the CenX token contract.
     * @param _fee The fee of the forced withdrawal (in percentage).
     * @param _withdrawalLockDuration The time from the request after which the withdrawal will be available (in seconds).
     * @param _withdrawalUnlockDuration The time during which the withdrawal will be available from the moment of unlocking (in seconds).
     */
    function initialize(
        address _owner,
        address _tokenAddress,
        uint256 _fee,
        uint256 _withdrawalLockDuration,
        uint256 _withdrawalUnlockDuration,
        uint256 _rewardMaturityDuration,
        uint256 _rewardSharePercent
    ) external initializer {
        require(_owner != address(0), "zero address");
        require(_tokenAddress.isContract(), "not a contract address");

        OwnableUpgradeable.__Ownable_init_unchained();
        ReentrancyGuardUpgradeable.__ReentrancyGuard_init_unchained();
        PausableUpgradeable.__Pausable_init_unchained();

        token = CentralexToken(_tokenAddress);

        setFee(_fee);
        setWithdrawalLockDuration(_withdrawalLockDuration);
        setWithdrawalUnlockDuration(_withdrawalUnlockDuration);
        setRewardMaturityDuration(_rewardMaturityDuration);
        setRewardSharePercent(_rewardSharePercent);

        OwnableUpgradeable.transferOwnership(_owner);
    }

    /**
     * @dev This method is used to deposit tokens to a new deposit.
     * It generates a new deposit ID and calls another public "deposit" method. See its description.
     * @param _amount The amount to deposit.
     */
    function deposit(uint256 _amount) external whenNotPaused {
        deposit(++lastDepositIds[msg.sender], _amount);
    }

    /**
     * @dev This method is used to deposit tokens to the deposit opened before.
     * Sender must approve tokens first.
     *
     * Note: each call updates the deposit date so be careful if you want to make a long staking.
     *
     * @param _depositId User's unique deposit ID.
     * @param _amount The amount to deposit.
     */
    function deposit(uint256 _depositId, uint256 _amount) public whenNotPaused nonReentrant {
        require(_depositId > 0 && _depositId <= lastDepositIds[msg.sender], "deposit: wrong deposit id");
        _deposit(msg.sender, _depositId, _amount);
        require(token.transferFrom(msg.sender, address(this), _amount), "deposit: transfer failed");
    }

    /**
     * @dev This method is used withdraw tokens from the staking back to owners token account.
     * Sender must approve tokens first.
     */
    function ownerWithdraw() public whenNotPaused onlyOwner nonReentrant {
        require(token.transfer(owner(), totalOnwerReward), "_withdraw: transfer failed");
        totalOnwerReward = 0;
    }

    /**
     * @dev This method is used to make a forced withdrawal with a fee.
     * It calls the internal "_withdraw" method.
     * @param depositId User's unique deposit ID.
     */
    function makeForcedWithdrawal(uint256 depositId) external whenNotPaused nonReentrant {
        _withdraw(msg.sender, depositId, true);
    }

    /**
     * @dev This method is used to request a withdrawal without a fee.
     * It sets the date of the request.
     *
     * Note: each call updates the date of the request so don't call this method twice during the lock.
     *
     * @param _depositId User's unique deposit ID.
     */
    function requestWithdrawal(uint256 _depositId) external whenNotPaused {
        require(_depositId > 0 && _depositId <= lastDepositIds[msg.sender], "wrong deposit id");
        withdrawalRequestsDates[msg.sender][_depositId] = _now();
        emit WithdrawalRequested(msg.sender, _depositId);
    }

    /**
     * @dev This method is used to make a requested withdrawal.
     * It calls the internal "_withdraw" method and resets the date of the request.
     * If sender didn't call this method during the unlock period (if timestamp >= lockEnd + withdrawalUnlockDuration)
     * they have to call "requestWithdrawal" one more time.
     *
     * @param _depositId User's unique deposit ID.
     */
    function makeRequestedWithdrawal(uint256 _depositId) external whenNotPaused nonReentrant {
        uint256 requestDate = withdrawalRequestsDates[msg.sender][_depositId];
        require(requestDate > 0, "withdrawal wasn't requested");
        uint256 timestamp = _now();
        uint256 lockEnd = requestDate.add(withdrawalLockDuration());
        require(timestamp >= lockEnd, "too early");
        require(timestamp < lockEnd.add(withdrawalUnlockDuration()), "too late");
        withdrawalRequestsDates[msg.sender][_depositId] = 0;
        _withdraw(msg.sender, _depositId, false);
    }

    /**
     * @dev Sets the fee for forced withdrawals. Can only be called by owner.
     * @param _value The new fee value (in percentage).
     */
    function setFee(uint256 _value) public onlyOwner whenNotPaused {
        require(_value <= 1 ether, "should be less than or equal to 1 ether");
        _updateUintParam(feeParam, _value);
        emit FeeSet(_value, msg.sender);
    }

    /**
     * @dev Sets the fee for forced withdrawals. Can only be called by owner.
     * @param _value The new fee value (in percentage).
     */
    function setRewardMaturityDuration(uint256 _value) public onlyOwner whenNotPaused {
        require(_value <= 180 days, "shouldn't be greater than 180 days");
        _updateUintParam(rewardMaturityDurationParam, _value);
        emit RewardMaturityDurationSet(_value, msg.sender);
    }

    /**
     * @dev Sets the reward distribution. Can only be called by owner.
     * @param _value The new fee value (in percentage).
     */
    function setRewardSharePercent(uint256 _value) public onlyOwner whenNotPaused {
        require(_value <= 1 ether, "should be less than or equal to 1 ether");
        _updateUintParam(rewardSharePercentParam, _value);
        emit RewardDistributionSet(_value, msg.sender);
    }

    /**
     * @dev Sets the time from the request after which the withdrawal will be available.
     * Can only be called by owner.
     * @param _value The new duration value (in seconds).
     */
    function setWithdrawalLockDuration(uint256 _value) public onlyOwner whenNotPaused {
        require(_value <= 30 days, "shouldn't be greater than 30 days");
        _updateUintParam(withdrawalLockDurationParam, _value);
        emit WithdrawalLockDurationSet(_value, msg.sender);
    }

    /**
     * @dev Sets the time during which the withdrawal will be available from the moment of unlocking.
     * Can only be called by owner.
     * @param _value The new duration value (in seconds).
     */
    function setWithdrawalUnlockDuration(uint256 _value) public onlyOwner whenNotPaused {
        require(_value >= 1 hours, "shouldn't be less than 1 hour");
        _updateUintParam(withdrawalUnlockDurationParam, _value);
        emit WithdrawalUnlockDurationSet(_value, msg.sender);
    }

    /**
     * @dev Returns user total balance.
     * @param voter The user who votes.
     * @return Returns User total balance.
     */
    function totalUserBalance(address voter)
        public view
        whenNotPaused
        returns(uint256)
    {
        require(voter != address(0), "totalUserBalance: voter address is not valid");
        uint256 count = lastDepositIds[voter];
        uint256 totalUserStaked = 0;

        for (uint i = 0; i <= count; i++) {
            totalUserStaked = totalUserStaked.add(balances[voter][i]);
        }

        return totalUserStaked;
    }

    /**
     * @return Returns current fee.
     */
    function fee() public view whenNotPaused returns (uint256) {
        return _getUintParamValue(feeParam);
    }

    /**
     * @return Returns the current reward distribution.
     */
    function rewardSharePercent() public view whenNotPaused returns (uint256) {
        return _getUintParamValue(rewardSharePercentParam);
    }

    /**
     * @return Returns current reward maturity duration in seconds.
     */
    function rewardMaturityDuration() public view whenNotPaused returns (uint256) {
        return _getUintParamValue(rewardMaturityDurationParam);
    }

    /**
     * @return Returns current withdrawal lock duration.
     */
    function withdrawalLockDuration() public view whenNotPaused returns (uint256) {
        return _getUintParamValue(withdrawalLockDurationParam);
    }

    /**
     * @return Returns current withdrawal unlock duration.
     */
    function withdrawalUnlockDuration() public whenNotPaused view returns (uint256) {
        return _getUintParamValue(withdrawalUnlockDurationParam);
    }

    /**
     * @dev Reward _amount to be distributed proportionally to active stake.
     * @param _amount New reward coming into the staking.
     */
    function distribute(uint256 _amount) public whenNotPaused onlyOwner nonReentrant {
        require(_amount > 0, "distribute: amount must be greater than 0");
        _distribute(msg.sender, _amount, false);
    }

    /**
     * @dev Reward _amount to be distributed proportionally to active stake.
     * @param reward New reward coming into the staking.
     */
    function _distribute(address sender, uint256 reward, bool isFee) internal {
        emit RewardDistributed(reward);

        uint256 stakersReward = reward.mul(rewardSharePercent()).div(1 ether);
        uint256 onwerReward = reward.sub(stakersReward);

        totalRemainingReward = totalRemainingReward.add(reward);
        totalStakersReward = totalStakersReward.add(stakersReward);
        totalOnwerReward = totalOnwerReward.add(onwerReward);

        emit RewardUpdated(stakersReward, onwerReward, totalRemainingReward, totalStakersReward, totalOnwerReward);

        if (totalStaked != 0) {
            // S = S + r / T;
            currentRewardFactor = currentRewardFactor.add(stakersReward.mul(1 ether).div(totalStaked));
            emit RewardFactorUpdated(currentRewardFactor, totalStaked);
        }

        if (!isFee){
            require(token.transferFrom(sender, address(this), reward), "_distribute: transfer failed");
        }
    }

    /**
     * @dev Recalculate balance in case the deposit is already made.
     * @param _sender The address of the sender.
     * @param _id User's unique deposit ID.
     * @param _amount The amount to deposit.
     */
    function _deposit(address _sender, uint256 _id, uint256 _amount) internal {
        require(_amount > 0, "deposit amount should be more than 0");

        uint256 userBalance = balances[_sender][_id];
        uint256 deposited = 0;
        uint256 reward = 0;
        uint256 timePassed = 0;

        // Recalculate balances
        if (userBalance > 0)
        {
            (deposited, reward, timePassed) = _withdrawDepositAndReward(_sender, _id);
            userBalance = _amount.add(deposited).add(reward);
        } else {
            userBalance = _amount;
        }

        // Assign amount
        balances[_sender][_id] = userBalance;
        // Update lastRewardFactor
        depositRewardFactor[_sender][_id] = currentRewardFactor;
        // Update total staked
        totalStaked = totalStaked.add(userBalance);
        // Update last deposit date
        depositDates[_sender][_id] = _now();

        emit Deposited(_sender, _id, _amount, userBalance, reward, timePassed, currentRewardFactor, totalStaked);
    }

    /**
     * @dev Helper function to withdraw full amount and assign reward.
     * @param _user The address of the sender.
     * @param _id User's unique deposit ID.
     */
    function _withdrawDepositAndReward(address _user, uint256 _id)
        internal
        returns (uint256 deposited, uint256 reward, uint256 timePassed) {

        deposited = balances[_user][_id];
        uint256 depositTime = depositDates[_user][_id];
        timePassed = _now().sub(depositTime);

        // Formula: reward = deposited * (S - S0[address]);
        reward = deposited.mul(currentRewardFactor.sub(depositRewardFactor[_user][_id])).div(1 ether);

        if (timePassed < 1 days) {
            reward = 0;
        } else if (timePassed < rewardMaturityDuration()) {
            reward = rewardMaturityDuration().div(timePassed).mul(reward).sub(reward);
        }

        // Finalizing with contract states
        balances[_user][_id] = 0;
        totalRemainingReward = totalRemainingReward.sub(reward);
        totalStaked = totalStaked.sub(deposited);
        depositDates[_user][_id] = 0;

        emit BeforeDepositAndRewardWithdrawn(_user, _id, deposited, reward);
    }

    /**
     * @dev Withdraw is possible only in full amount.
     * @dev Calls internal "_mint" method and then transfers tokens to the sender.
     * @param _sender The address of the sender.
     * @param _id User's unique deposit ID.
     * @param _forced Defines whether to apply fee (true), or not (false).
     */
    function _withdraw(address _sender, uint256 _id, bool _forced) internal {
        require(_id > 0 && _id <= lastDepositIds[_sender], "wrong deposit id");
        require(balances[_sender][_id] > 0, "insufficient funds");

        (uint256 deposited, uint256 reward, uint timePassed) = _withdrawDepositAndReward(_sender, _id);

        uint256 feeValue = 0;
        if (_forced) {
            feeValue = deposited.mul(fee()).div(1 ether);
            deposited = deposited.sub(feeValue);
            _distribute(_sender, feeValue, true);
        }

        uint256 withdrawalSum = deposited.add(reward);

        require(token.transfer(_sender, withdrawalSum), "_withdraw: transfer failed");
        emit Withdrawn(_sender, _id, withdrawalSum, feeValue, balances[_sender][_id], reward, timePassed, totalStaked, totalRemainingReward);
    }

    /**
     * @dev Sets the next value of the parameter and the timestamp of this setting.
     */
    function _updateUintParam(UintParam storage _param, uint256 _newValue) internal {
        if (_param.timestamp == 0) {
            _param.oldValue = _newValue;
        } else if (_paramUpdateDelayElapsed(_param.timestamp)) {
            _param.oldValue = _param.newValue;
        }
        _param.newValue = _newValue;
        _param.timestamp = _now();
    }

    /**
     * @return Returns the current value of the parameter.
     */
    function _getUintParamValue(UintParam memory _param) internal view returns (uint256) {
        return _paramUpdateDelayElapsed(_param.timestamp) ? _param.newValue : _param.oldValue;
    }

    /**
     * @return Returns true if param update delay elapsed.
     */
    function _paramUpdateDelayElapsed(uint256 _paramTimestamp) internal view returns (bool) {
        return _now() > _paramTimestamp.add(PARAM_UPDATE_DELAY);
    }

    /**
     * @dev Pauses all actions on the contract.
     *
     * See {ERC20Pausable} and {Pausable-_pause}.
     */
    function pause() public onlyOwner virtual {
        _pause();
    }

    /**
     * @dev Unpauses all token transfers.
     *
     * See {ERC20Pausable} and {Pausable-_unpause}.
     *
     */
    function unpause() public onlyOwner virtual {
        _unpause();
    }

    /**
     * @return Returns current timestamp.
     */
    function _now() internal view returns (uint256) {
        // Note that the timestamp can have a 900-second error:
        // https://github.com/ethereum/wiki/blob/c02254611f218f43cbb07517ca8e5d00fd6d6d75/Block-Protocol-2.0.md
        return block.timestamp; // solium-disable-line security/no-block-members
    }
}
