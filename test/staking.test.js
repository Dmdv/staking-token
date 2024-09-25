/* eslint-disable */
const { ether, BN, expectRevert, expectEvent, constants, time, balance, send } = require("@openzeppelin/test-helpers");
const { expect } = require("chai");
const { accounts, contract, web3 } = require("@openzeppelin/test-environment");

const Staking = contract.fromArtifact("Staking");
const Token = contract.fromArtifact("ERC677Mock");

describe("Staking", () => {
  const [owner, user1, user2, user3] = accounts;
  const YEAR = new BN(31536000); // in seconds
  const MAX_EMISSION_RATE = ether("0.15"); // 15%
  const PARAM_UPDATE_DELAY = new BN(604800); // 7 days in seconds
  const fee = ether("0.03"); // 3%
  const rewardSharePercent = ether("0.25"); // 25%
  const withdrawalLockDuration = new BN(3600); // in seconds
  const withdrawalUnlockDuration = new BN(3600); // in seconds
  const rewardMaturityDuration = new BN(1209600); // 2 weeks in seconds
  const oneEther = ether("1");
  const ether1000 = ether("1000");
  const ether10000 = ether("10000");
  const ether800 = ether("800");
  const ether200 = ether("200");
  const ether100 = ether("100");
  const ether90 = ether("90");
  const ether80 = ether("80");
  const ether20 = ether("20");
  const ether0 = ether("0");

  let staking;
  let cenXToken;

  function userSharedReward (reward, percent) {
    const usersReward = reward.mul(percent).div(oneEther);
    const ownerReward = reward.sub(usersReward);
    return {usersReward, ownerReward};
  }

  function updateRewardFactor (currentRewardFactor, usersReward, totalStaked) {
    return currentRewardFactor.add(usersReward.mul(oneEther).div(totalStaked));
  }

  function initialize(...params) {
    // return staking.methods[initializeMethod](...params, { from: owner });
    staking.initialize(
      owner,
      cenXToken.address,
      fee.toString(),
      withdrawalLockDuration.toString(),
      withdrawalUnlockDuration.toString(),
      rewardMaturityDuration.toString(),
      rewardSharePercent.toString(),
    );
  }

  async function getBlockTimestamp(receipt) {
    return new BN((await web3.eth.getBlock(receipt.receipt.blockNumber)).timestamp);
  }

  function testDeposit(directly) {
    beforeEach(async () => {
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(owner, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether("10000"), { from: user1 });
      await cenXToken.approve(staking.address, ether("10000"), { from: owner });
    });

    it("should deposit", async () => {
      const value = ether("100");

      let receipt = await staking.deposit(value, { from: user1 });
      expectEvent(receipt, "Deposited", {
        sender: user1,
        id: new BN(1),
        amount: value,
        userBalance: value,
        reward: new BN(0),
        prevDepositDuration: new BN(0),
        currentRewardFactor: new BN(0),
        totalStaked: value
      });

      const timestamp = await getBlockTimestamp(receipt);
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(value);
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(timestamp);
    });

    it("should get reward", async () => {

      let receipt = await staking.deposit(ether100, { from: user1 });
      const percent = await staking.rewardSharePercent();
      expect(percent).to.be.bignumber.equal(ether("0.25"));

      const timestampBefore = await getBlockTimestamp(receipt);
      await time.increase(YEAR.div(new BN(8)));

      receipt = await staking.methods["deposit(uint256,uint256)"](1, ether100, { from: user1 });
      await time.increase(YEAR.div(new BN(8)));

      const timestampAfter = await getBlockTimestamp(receipt);
      const timePassed = timestampAfter.sub(timestampBefore);
      const totalStaked = ether100.add(ether100);

      expectEvent(receipt, "Deposited", {
        sender: user1,
        id: new BN(1),
        amount: ether100,
        userBalance: totalStaked,
        reward: new BN(0),
        prevDepositDuration: new BN(timePassed),
        currentRewardFactor: new BN(0),
        totalStaked: totalStaked
      });

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(totalStaked);
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(timestampAfter);
      expect(await staking.totalStaked()).to.be.bignumber.equal(totalStaked);

      await time.increase(YEAR);

      // distribute

      await staking.setFee(new BN(0), {from: owner});
      await staking.setRewardSharePercent(rewardSharePercent, {from: owner});

      await cenXToken.mint(owner, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, { from: owner });
      await cenXToken.approve(owner, ether10000, { from: owner });

      const reward = ether1000;
      let currentRewardFactor = ether0;

      receipt = await staking.methods["distribute(uint256)"](reward, { from: owner });

      const usersReward = reward.mul(percent).div(oneEther);
      expect(usersReward).to.be.bignumber.equal(ether("250"));
      // const usersReward = userSharedReward(reward, percent);
      currentRewardFactor = usersReward.mul(oneEther).div(totalStaked);

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor,
        totalStaked: totalStaked
      });

      receipt = await staking.makeForcedWithdrawal(1, { from: user1 });

      expectEvent(receipt, "BeforeDepositAndRewardWithdrawn", {
        sender: user1,
        id: new BN(1),
        deposit: totalStaked,
        reward: usersReward
      });
    });

    it("should deposit using an old id", async () => {
      await staking.setFee(0, { from: owner });

      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000);
      expect(await cenXToken.balanceOf(user2)).to.be.bignumber.equal(ether0);

      const receipt1 = await staking.methods['deposit(uint256)'](ether100, { from: user1 });
      const timeBefore1 = await getBlockTimestamp(receipt1);

      await time.increase(1);

      const receipt2 = await staking.methods['deposit(uint256)'](ether100, { from: user1 });
      const timeBefore2 = await getBlockTimestamp(receipt2);

      await time.increase(1);

      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether800);
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether100);
      expect(await staking.balances(user1, 2)).to.be.bignumber.equal(ether100);

      await time.increase(YEAR);

      const receiptTake1 = await staking.makeForcedWithdrawal(1, { from: user1 });
      const timeAfterWithdrawal1 = await getBlockTimestamp(receiptTake1)
      const timePassed1 = timeAfterWithdrawal1.sub(timeBefore1);

      await time.increase(1);

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.totalStaked()).to.be.bignumber.equal(ether100);

      expectEvent(receiptTake1, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: ether100,
        fee: ether0,
        balance: ether0,
        reward: ether0,
        lastDepositDuration: timePassed1,
        totalStaked: ether100,
        totalRemainingReward: ether0
      });

      const receiptTake2 = await staking.makeForcedWithdrawal(2, { from: user1 });
      const timeAfterWithdrawal2 = await getBlockTimestamp(receiptTake2);
      const timePassed2 = timeAfterWithdrawal2.sub(timeBefore2);

      expect(await staking.balances(user1, 2)).to.be.bignumber.equal(ether0);
      expect(await staking.totalStaked()).to.be.bignumber.equal(ether0);

      expectEvent(receiptTake2, "Withdrawn", {
        sender: user1,
        id: new BN(2),
        withdrawalSum: ether100,
        fee: ether0,
        balance: ether0,
        reward: ether0,
        lastDepositDuration: timePassed2,
        totalStaked: ether0,
        totalRemainingReward: ether0
      });

      // deposit = 0
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000);
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.balances(user1, 2)).to.be.bignumber.equal(ether0);
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.depositDates(user1, 2)).to.be.bignumber.equal(ether0);

      // deposit +100
      const receipt3 = await staking.methods['deposit(uint256,uint256)'](1, ether100, { from: user1 });
      const timestampBefore3 = await getBlockTimestamp(receipt3);

      const totalStaked = await staking.totalStaked();
      expect(totalStaked).to.be.bignumber.equal(ether100);
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether100);

      const balanceBefore = await cenXToken.balanceOf(user1);

      await time.increase(YEAR);

      // deposit -100
      const receiptTake3 = await staking.makeForcedWithdrawal(1, { from: user1 });
      const timestampAfter3 = await getBlockTimestamp(receiptTake3);
      const timePassed3 = timestampAfter3.sub(timestampBefore3);

      // Withdrawn without reward being added, so the balance must not change
      expectEvent(receiptTake3, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: ether100,
        fee: ether0,
        balance: ether0,
        reward: ether0,
        lastDepositDuration: timePassed3,
        totalStaked: ether0,
        totalRemainingReward: ether0
      });

      // deposit = 0
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000);
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.balances(user1, 2)).to.be.bignumber.equal(ether0);
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.depositDates(user1, 2)).to.be.bignumber.equal(ether0);

      const balanceAfter = await cenXToken.balanceOf(user1);
      expect(balanceAfter).to.be.bignumber.equal(balanceBefore.add(ether100));
    });

    it("fails if deposit value is zero", async () => {
      if (directly) {
        await expectRevert(
          staking.methods["deposit(uint256)"](0, { from: user1 }),
          "deposit amount should be more than 0"
        );
      } else {
        await expectRevert(
          cenXToken.transfer(staking.address, 0, { from: user1 }),
          `you can't transfer to bridge contract` // if onTokenTransfer() fails
        );
      }
    });
  }

  beforeEach(async () => {
    cenXToken = await Token.new();
    staking = await Staking.new();
    await initialize();
    await cenXToken.initialize("Centralex", "CenX", 0, owner, [owner, staking.address], [], staking.address);
  });

  describe("initialize", () => {
    it("should be set up correctly", async () => {
      expect(await staking.token()).to.equal(cenXToken.address);
    });

    it("fails if any of parameters is incorrect", async () => {
      staking = await Staking.new();

      await expectRevert(
        staking.initialize(
          constants.ZERO_ADDRESS,
          cenXToken.address,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          rewardMaturityDuration.toString(),
          rewardSharePercent.toString(),
        ),
        "zero address"
      );

      await expectRevert(
        staking.initialize(
          owner,
          constants.ZERO_ADDRESS,
          fee.toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          rewardMaturityDuration.toString(),
          rewardSharePercent.toString()
        ),
        "not a contract address"
      );

      await expectRevert(
        staking.initialize(
          owner,
          cenXToken.address,
          ether("1.01").toString(),
          withdrawalLockDuration.toString(),
          withdrawalUnlockDuration.toString(),
          rewardMaturityDuration.toString(),
          rewardSharePercent.toString(),
        ),
        "should be less than or equal to 1 ether"
      );

      await expectRevert(
        staking.initialize(
          owner,
          cenXToken.address,
          fee.toString(),
          2592001,
          withdrawalUnlockDuration.toString(),
          rewardMaturityDuration.toString(),
          rewardSharePercent.toString(),
        ),
        `shouldn't be greater than 30 days`
      );

      await expectRevert(
        staking.initialize(
          owner,
          cenXToken.address,
          fee.toString(),
          withdrawalLockDuration.toString(),
          0,
          rewardMaturityDuration.toString(),
          rewardSharePercent.toString(),
        ),
        `shouldn't be less than 1 hour`
      );
    });
  });

  describe("Scalable Reward Distribution", async () => {

    // function updateRewardFactor(prev, reward, totalStaked) {
    //   return prev.add(reward.div(totalStaked));
    // }
    //
    // function calcReward(deposited, currentRewardFactor, userRewardFactor) {
    //   return deposited.mul(currentRewardFactor.sub(userRewardFactor));
    // }
    //

    beforeEach(async () => {
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(owner, ether10000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, { from: user1 });
      await cenXToken.approve(staking.address, ether10000, { from: owner });
      await staking.setFee(new BN(0), {from: owner});
      await staking.setRewardSharePercent(rewardSharePercent, {from: owner});
    });

    it("Default reward distribution is 25%", async ()=> {
      const percent = await staking.rewardSharePercent();
      expect(percent).to.be.bignumber.equals(ether("0.25"));
    });

    it("Reward is distributed according to `rewardSharePercent`", async ()=> {
      const reward1 = ether1000;

      const share1 = userSharedReward(reward1, rewardSharePercent);

      let receipt = await staking.methods["distribute(uint256)"](reward1, { from: owner });

      expectEvent(receipt, "RewardUpdated", {
        stakersReward: share1.usersReward,
        ownerReward: share1.ownerReward,
        totalRemainingReward: reward1,
        totalStakersReward: share1.usersReward,
        totalOnwerReward: share1.ownerReward
      });

      const reward2 = ether100;

      const share2 = userSharedReward(reward2, rewardSharePercent);

      receipt = await staking.methods["distribute(uint256)"](reward2, { from: owner });

      expectEvent(receipt, "RewardUpdated", {
        stakersReward: share2.usersReward,
        ownerReward: share2.ownerReward,
        totalRemainingReward: reward1.add(reward2),
        totalStakersReward: share1.usersReward.add(share2.usersReward),
        totalOnwerReward: share1.ownerReward.add(share2.ownerReward)
      });
    });

    it ("When user deposits at deposit ID=1, after reward and new deposit the personal reward factor is updated", async () => {

      const percent = await staking.rewardSharePercent();
      let totalStaked = ether0;
      let currentRewardFactor = ether0;
      const reward = ether200;

      await staking.methods["deposit(uint256)"](ether100, { from: user1 });
      totalStaked = totalStaked.add(ether100);
      await time.increase(YEAR);

      const receipt = await staking.methods["distribute(uint256)"](reward, { from: owner });
      const share = userSharedReward(reward, percent);

      currentRewardFactor = currentRewardFactor.add(share.usersReward.mul(oneEther).div(totalStaked));

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor,
        totalStaked: totalStaked
      });

      await staking.methods["deposit(uint256,uint256)"](1, ether100, { from: user1 });

      expect(await staking.depositRewardFactor(user1, 1)).to.be.bignumber.equal(currentRewardFactor);
    });

    it ("When user deposits, after reward the current reward factor: S = S + r/T", async () => {
      const totalStaked = ether100;
      const reward = ether200;
      let currentRewardFactor = new BN(0);

      await staking.methods["deposit(uint256)"](totalStaked, { from: user1 });
      await time.increase(YEAR);
      const receipt = await staking.methods["distribute(uint256)"](reward, { from: owner });
      expect(await staking.depositRewardFactor(user1, 1)).to.be.bignumber.equal(new BN(0));

      const share = userSharedReward(reward, rewardSharePercent);
      currentRewardFactor = currentRewardFactor.add(share.usersReward.mul(oneEther).div(totalStaked));

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor,
        totalStaked: totalStaked
      });
    });

    it ("When user deposits and there's no reward, the personal reward factor is ZERO",async () => {
      await staking.methods["deposit(uint256)"](ether100, { from: user1 });
      await time.increase(YEAR);
      await staking.methods["deposit(uint256)"](ether100, { from: user1 });
      expect(await staking.depositRewardFactor(user1, 1)).to.be.bignumber.equal(new BN(0));
    });

    it ("When user withdraws and no time has elapsed since last deposit, he doesn't get reward",async () => {
      await time.increase(YEAR);
      const balance = await cenXToken.balanceOf(user1);
      const receipt1 = await staking.methods["deposit(uint256)"](ether100, { from: user1 });
      const timeBefore = await getBlockTimestamp(receipt1);

      await time.increase(1);

      await staking.methods["distribute(uint256)"](ether200, { from: owner });
      await time.increase(1);

      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(balance.sub(ether100));
      await time.increase(1);

      const receipt2 = await staking.makeForcedWithdrawal(1, { from: user1 });
      await time.increase(1);
      const timeAfter = await getBlockTimestamp(receipt2);

      expectEvent(receipt2, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: ether100,
        fee: ether0,
        balance: ether0,
        reward: ether0,
        lastDepositDuration: timeAfter.sub(timeBefore),
        totalStaked: ether0,
        totalRemainingReward: ether200
      });

      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(balance);
    });

    it ("When user withdraws after rewardMaturityDuration, the 100% of his reward is available",async () => {
      const deposited = ether100;
      const reward = ether200;

      await time.increase(YEAR);
      const balance = await cenXToken.balanceOf(user1);
      await time.increase(1);
      let receipt = await staking.methods["deposit(uint256)"](deposited, { from: user1 });
      const timestampBefore = await getBlockTimestamp(receipt);
      await time.increase(YEAR);
      await staking.methods["distribute(uint256)"](reward, { from: owner });
      await time.increase(10);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(balance.sub(deposited));
      await time.increase(10);
      receipt = await staking.makeForcedWithdrawal(1, { from: user1 });
      const timestampAfter = await getBlockTimestamp(receipt);

      // const sharedReward = userSharedReward(reward, percent);
      // expect(sharedReward).to.be.bignumber.equal(ether("0.5"));
      // let currentRewardFactor = updateRewardFactor(userRewardFactor, sharedReward, deposited);
      // currentRewardFactor = userRewardFactor.add(sharedReward.mul(oneEther).div(deposited));
      //
      // const userReward = calcReward(deposited, currentRewardFactor, userRewardFactor);
      //
      // expect(currentRewardFactor).to.be.bignumber.equal(ether("0.5"));
      // expect(currentRewardFactor.sub(userRewardFactor)).to.be.bignumber.equal(new BN(currentRewardFactor));
      // expect(deposited).to.be.bignumber.equal(new BN(100));
      // expect(deposited.mul(currentRewardFactor)).to.be.bignumber.equal(new BN(50));
      //
      // expect(userReward).to.be.bignumber.equal(new BN(50));
      // expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(balance.add(ether(userReward)));

      expectEvent(receipt, "BeforeDepositAndRewardWithdrawn", {
        sender: user1,
        id: new BN(1),
        deposit: ether100,
        reward: ether("50")
      });

      expectEvent(receipt, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: ether("150"),
        fee: ether0,
        balance: ether0,
        reward: ether("50"),
        lastDepositDuration: timestampAfter.sub(timestampBefore),
        totalStaked: ether0,
        totalRemainingReward: reward.sub(ether("50"))
      });

      // expect(await staking.totalRemainingReward()).to.be.bignumber.equal(reward.sub(userReward));
      // expect(await staking.totalStakersReward()).to.be.bignumber.equal(reward.div(new BN(4)));
      // expect(await staking.totalStakersReward()).to.be.bignumber.equal(userReward);
    });
  });

  describe("deposit", () => {
    testDeposit(true);
    it("fails if wrong deposit id", async () => {
      await expectRevert(
        staking.methods["deposit(uint256,uint256)"](1, ether("100"), {
          from: user1,
        }),
        "wrong deposit id"
      );
    });
  });

  describe("User eligibility to vote", () => {

    beforeEach(async () => {
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(user2, ether1000, { from: owner });
      await cenXToken.mint(owner, ether10000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, { from: user1 });
      await cenXToken.approve(staking.address, ether10000, { from: user2 });
      await cenXToken.approve(staking.address, ether10000, { from: owner });

      await staking.methods["deposit(uint256)"](ether20, { from: user2 });
    });

    it("User should be not eligible if never staked", async () => {
      const actual = await staking.totalUserBalance(user1);
      expect(actual).to.be.bignumber.equal(ether0);
    });

    it("Unknown user not eligible", async () => {
      const actual = await staking.totalUserBalance(user3);
      expect(actual).to.be.bignumber.equal(ether0);
    });

    it("User should be eligible if staked", async () => {
      expect(await staking.balances(user2, 0)).to.be.bignumber.equal(ether0);
      expect(await staking.balances(user2, 1)).to.be.bignumber.equal(ether20);
      expect(await staking.lastDepositIds(user1)).to.be.bignumber.equal(new BN(0));
      expect(await staking.lastDepositIds(user2)).to.be.bignumber.equal(new BN(1));

      const actual = await staking.totalUserBalance(user2);
      expect(actual).to.be.bignumber.equal(ether20);
    });
  });

  describe("makeForcedWithdrawal", () => {

    beforeEach(async () => {
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(owner, ether10000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, { from: user1 });
      await cenXToken.approve(staking.address, ether10000, { from: owner });
    });

    it("should withdraw", async () => {
      let receipt = await staking.methods["deposit(uint256)"](ether1000, { from: user1 });
      const timestampBefore = await getBlockTimestamp(receipt);
      expect(await staking.totalStaked()).to.be.bignumber.equal(ether1000);

      await time.increase(1); // make sure the timestamp of two consequent blocks is different

      receipt = await staking.makeForcedWithdrawal(1, { from: user1 });
      let timestampAfter = await getBlockTimestamp(receipt);
      expect(timestampAfter).to.be.bignumber.gt(timestampBefore);
      let timePassed = timestampAfter.sub(timestampBefore);
      expect(timePassed).to.be.bignumber.gte(new BN(1));

      // Fee value will be deduced from the whole withdrawn balance
      const feeValue1 = ether1000.mul(fee).div(oneEther);
      expect(feeValue1).to.be.bignumber.gt(new BN(0));

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await staking.totalStaked()).to.be.bignumber.equal(ether0);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000.sub(feeValue1));

      expectEvent(receipt, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: ether1000.sub(feeValue1),
        fee: feeValue1,
        balance: ether0,
        reward: ether0,
        lastDepositDuration: timePassed,
        totalStaked: ether0,
        totalRemainingReward: feeValue1
      });

      const expectedBalance = ether1000.sub(feeValue1);

      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(expectedBalance);
      expect(await staking.totalStaked()).to.be.bignumber.equal(new BN(0));
      expect(await staking.depositDates(user1, 1)).to.be.bignumber.equal(new BN(0));
    });

    it("When the reward is distributed and totalStaking is not 0, currentRewardFactor is updated", async () => {

      const depositSum = ether100;
      const reward1 = ether1000;
      const reward2 = ether100;

      let currentRewardFactor = ether0;
      let totalStaked = new BN(0);

      await staking.setFee(new BN(0), {from: owner});

      await cenXToken.mint(user2, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether("10000"), { from: user2 });

      await staking.methods["deposit(uint256)"](depositSum, { from: user1 });
      await time.increase(YEAR);

      totalStaked = totalStaked.add(depositSum);
      const reward = userSharedReward(reward1, rewardSharePercent);
      const currentRewardFactor1 = updateRewardFactor(currentRewardFactor, reward.usersReward, totalStaked);

      let receipt = await staking.methods["distribute(uint256)"](reward1, { from: owner });

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor1,
        totalStaked: totalStaked
      });

      expect(await cenXToken.balanceOf(user2)).to.be.bignumber.equals(ether1000);
      await staking.methods["deposit(uint256)"](depositSum, { from: user2 });

      await time.increase(YEAR);

      totalStaked = totalStaked.add(depositSum);
      const share = userSharedReward(reward2, rewardSharePercent);
      const currentRewardFactor2 = currentRewardFactor1.add(share.usersReward.mul(oneEther).div(totalStaked));

      receipt = await staking.methods["distribute(uint256)"](reward2, { from: owner });

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor2,
        totalStaked: totalStaked
      });
    });

    it("When user makes force withdrawl, the fee stays on the balance of the staking", async () => {

      const depositSum = ether100;

      const balanceBefore = await cenXToken.balanceOf(user1);

      await staking.methods["deposit(uint256)"](depositSum, { from: user1 });
      expect(await cenXToken.balanceOf(staking.address)).to.be.bignumber.equal(depositSum);
      await time.increase(YEAR);
      await staking.makeForcedWithdrawal(1, { from: user1 });

      const feeValue = depositSum.mul(fee).div(oneEther);

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(balanceBefore.sub(feeValue));
      expect(await cenXToken.balanceOf(staking.address)).to.be.bignumber.equal(feeValue);
    });

    it("When user withdraws, it subtracts from user staking balance and adds to user token balance", async () => {
      await staking.setFee(new BN(0), {from: owner});
      await staking.methods["deposit(uint256)"](ether100, { from: user1 });

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether100);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000.sub(ether100));

      await time.increase(YEAR);

      await staking.makeForcedWithdrawal(1, { from: user1 });

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether0);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000);
    });

    it("Reward share should split between stakeholder and the owner", async () => {
      await staking.setFee(new BN(0), {from: owner});
      await staking.setRewardSharePercent(rewardSharePercent, {from: owner});

      const reward = ether100;
      const reward2 = ether1000;

      const stakerReward = reward.mul(rewardSharePercent).div(oneEther);
      const ownersReward = reward.sub(stakerReward)

      await staking.methods["deposit(uint256)"](ether100, { from: user1 });
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether100);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000.sub(ether100));

      let receipt = await staking.methods["distribute(uint256)"](reward, { from: owner });

      expectEvent(receipt, "RewardUpdated", {
        stakersReward: stakerReward,
        ownerReward: ownersReward,
        totalRemainingReward: reward,
        totalStakersReward: stakerReward,
        totalOnwerReward: ownersReward
      });

      const stakerReward2 = reward2.mul(rewardSharePercent).div(oneEther);
      const ownersReward2 = reward2.sub(stakerReward2)

      receipt = await staking.methods["distribute(uint256)"](reward2, { from: owner });

      expectEvent(receipt, "RewardUpdated", {
        stakersReward: stakerReward2,
        ownerReward: ownersReward2,
        totalRemainingReward: reward.add(reward2),
        totalStakersReward: stakerReward.add(stakerReward2),
        totalOnwerReward: ownersReward.add(ownersReward2)
      });
    });

    it("Withdraws with reward after staking and distributing the reward", async () => {

      const reward1 = ether100;
      const reward2 = ether100;

      let currentRewardFactor = ether0;
      let totalStaked = new BN(0);

      await staking.setFee(new BN(0), {from: owner});
      await staking.setRewardSharePercent(rewardSharePercent, {from: owner});

      await staking.methods["deposit(uint256)"](ether1000, { from: user1 });
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether1000);
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether0);
      totalStaked = totalStaked.add(ether1000);
      expect(await staking.totalStaked()).to.be.bignumber.equal(totalStaked);

      await time.increase(YEAR);

      let receipt = await staking.methods["distribute(uint256)"](reward1, { from: owner });
      let share = userSharedReward(reward1, rewardSharePercent);
      currentRewardFactor = currentRewardFactor.add(share.usersReward.mul(oneEther).div(totalStaked));

      expectEvent(receipt, "RewardFactorUpdated", {
        rewardFactor: currentRewardFactor,
        totalStaked: totalStaked
      });

      // receipt = await staking.methods["distribute(uint256)"](reward2, { from: owner });
      // currentRewardFactor = currentRewardFactor.add(reward2.div(totalStaked))
      //
      // expectEvent(receipt, "RewardFactorUpdated", {
      //   rewardFactor: currentRewardFactor,
      //   totalStaked: totalStaked
      // });

      await staking.makeForcedWithdrawal(1, { from: user1 });

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      // expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000.add(userShare).sub(feeValue));
    });

    it("fails if wrong deposit id", async () => {
      await staking.methods["deposit(uint256)"](ether("10"), { from: user1 });
      await expectRevert(
        staking.makeForcedWithdrawal(2, { from: user1 }),
        "wrong deposit id"
      );
      await staking.makeForcedWithdrawal(1, { from: user1 });
    });

    it("fails if zero balance", async () => {
      await staking.methods["deposit(uint256)"](ether("10"), {
        from: user1,
      });
      await staking.makeForcedWithdrawal(1, { from: user1 });
      await expectRevert(
        staking.makeForcedWithdrawal(1, { from: user1 }),
        "insufficient funds"
      );
    });

    it("should withdraw the same amount", async () => {

      await staking.setFee(0, {from: owner});

      await staking.methods["deposit(uint256)"](ether1000, { from: user1 });
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(ether1000);

      await time.increase(YEAR);

      await staking.makeForcedWithdrawal(1, { from: user1 });

      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(ether1000);

      await cenXToken.mint(user2, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether("10000"), { from: user2 });

      await staking.methods["deposit(uint256)"](ether1000, { from: user2 });
      expect(await staking.balances(user2, 1)).to.be.bignumber.equal(ether1000);

      await time.increase(YEAR);

      await staking.makeForcedWithdrawal(1, { from: user2 });

      expect(await staking.balances(user2, 1)).to.be.bignumber.equal(new BN(0));
      expect(await cenXToken.balanceOf(user2)).to.be.bignumber.equal(ether1000);
    });
  });

  describe("requestWithdrawal", () => {
    it("should request", async () => {

      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, {from: user1});
      await staking.deposit(ether1000, { from: user1 });

      const receipt = await staking.requestWithdrawal(1, { from: user1 });
      const timestamp = await getBlockTimestamp(receipt);
      expect(await staking.withdrawalRequestsDates(user1, 1)).to.be.bignumber.equal(timestamp);

      expectEvent(receipt, "WithdrawalRequested", {
        sender: user1,
        id: new BN(1),
      });
    });

    it("fails if wrong deposit id", async () => {
      await expectRevert(
        staking.requestWithdrawal(1, { from: user1 }),
        "wrong deposit id"
      );
    });
  });

  describe("makeRequestedWithdrawal", () => {

    const value = ether("1000");

    beforeEach(async () => {
      await cenXToken.mint(user1, value, { from: owner });
      await cenXToken.approve(staking.address, ether("10000"), { from: user1 });
    });

    it("should withdraw", async () => {

      let receipt = await staking.methods["deposit(uint256)"](value, { from: user1 });
      const timestampBefore = await getBlockTimestamp(receipt);

      await staking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration);
      receipt = await staking.makeRequestedWithdrawal(1, { from: user1 });

      const timestampAfter = await getBlockTimestamp(receipt);
      const timePassed = timestampAfter.sub(timestampBefore);

      const reward = ether0;

      expect(await staking.withdrawalRequestsDates(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await staking.balances(user1, 1)).to.be.bignumber.equal(new BN(0));
      expect(await cenXToken.balanceOf(user1)).to.be.bignumber.equal(value.add(reward));

      expectEvent(receipt, "Withdrawn", {
        sender: user1,
        id: new BN(1),
        withdrawalSum: value.add(reward),
        fee: ether0,
        balance: ether0,
        reward: reward,
        lastDepositDuration: timePassed,
        totalStaked: ether0,
        totalRemainingReward: ether0
      });
    });

    it("should fail if not requested", async () => {
      await staking.methods["deposit(uint256)"](value, { from: user1 });
      await expectRevert(staking.makeRequestedWithdrawal(1, { from: user1 }),
        `withdrawal wasn't requested`
      );
    });

    it("should fail if too early", async () => {
      await staking.methods["deposit(uint256)"](value, { from: user1 });
      await staking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration.sub(new BN(5)));

      await expectRevert(
        staking.makeRequestedWithdrawal(1, { from: user1 }),
        "too early"
      );
    });

    it("should fail if too late", async () => {
      await staking.methods["deposit(uint256)"](value, { from: user1 });
      await staking.requestWithdrawal(1, { from: user1 });
      await time.increase(withdrawalLockDuration.add(withdrawalUnlockDuration).add(new BN(1)));

      await expectRevert(
        staking.makeRequestedWithdrawal(1, { from: user1 }),
        "too late"
      );
    });
  });

  describe("totalStaked", () => {

    it("should be calculated correctly", async () => {

      let expectedTotalStaked = new BN(0);
      let user1Staked = new BN(0);
      let user2Staked = new BN(0);
      let ownerStaked = new BN(0);

      await cenXToken.mint(owner, ether1000, { from: owner });
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(user2, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether1000, { from: user1 });
      await cenXToken.approve(staking.address, ether1000, { from: user2 });
      await cenXToken.approve(staking.address, ether1000, { from: owner });

      await staking.deposit(ether20, {from: owner});
      expectedTotalStaked = expectedTotalStaked.add(ether20);
      ownerStaked = ownerStaked.add(ether20);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.deposit(ether200, { from: user1 });
      expectedTotalStaked = expectedTotalStaked.add(ether200);
      user1Staked = user1Staked.add(ether200);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.makeForcedWithdrawal(1, { from: user1 });
      expectedTotalStaked = expectedTotalStaked.sub(user1Staked);
      user1Staked = ether0;
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.deposit(ether1000, { from: user2 });
      expectedTotalStaked = expectedTotalStaked.add(ether1000);
      user2Staked = user2Staked.add(ether1000);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.deposit(ether80, { from: user1 });
      expectedTotalStaked = expectedTotalStaked.add(ether80);
      user1Staked = user1Staked.add(ether80);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.methods["deposit(uint256,uint256)"](1, ether90, { from: user1 });
      user1Staked = user1Staked.add(ether90);
      expectedTotalStaked = expectedTotalStaked.add(ether90);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.makeForcedWithdrawal(1, { from: owner });
      expectedTotalStaked = expectedTotalStaked.sub(ownerStaked);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.makeForcedWithdrawal(1, { from: user2 });
      expectedTotalStaked = expectedTotalStaked.sub(user2Staked);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.makeForcedWithdrawal(1, { from: user1 });
      expectedTotalStaked = expectedTotalStaked.sub(ether90);
      expect(await staking.totalStaked()).to.be.bignumber.equal(expectedTotalStaked);

      await time.increase(1);

      await staking.makeForcedWithdrawal(2, { from: user1 });
      expectedTotalStaked = expectedTotalStaked.sub(ether80);
      expect(await staking.totalStaked()).to.be.bignumber.equal(new BN(0));
      expect(expectedTotalStaked).to.be.bignumber.equal(new BN(0));
    });
  });

  describe("setFee", () => {
    it("should set", async () => {
      const newFee = ether("0.1");
      expect(await staking.fee()).to.be.bignumber.equal(fee);
      expect(newFee).to.be.bignumber.not.equal(fee);
      const receipt = await staking.setFee(newFee, { from: owner });
      expectEvent(receipt, "FeeSet", { value: newFee, sender: owner });
      await time.increase(PARAM_UPDATE_DELAY.sub(new BN(1)));
      expect(await staking.fee()).to.be.bignumber.equal(fee);
      await time.increase(2);
      expect(await staking.fee()).to.be.bignumber.equal(newFee);
    });
    it("fails if not an owner", async () => {
      await expectRevert(
        staking.setFee(ether("0.1"), { from: user1 }),
        "Ownable: caller is not the owner"
      );
    });
    it("fails if greater than 1 ether", async () => {
      await expectRevert(
        staking.setFee(ether("1.01"), { from: owner }),
        "should be less than or equal to 1 ether"
      );
    });
  });

  describe("setWithdrawalLockDuration", () => {
    it("should set", async () => {
      const newWithdrawalLockDuration = new BN(1000);
      expect(await staking.withdrawalLockDuration()).to.be.bignumber.equal(
        withdrawalLockDuration
      );
      expect(newWithdrawalLockDuration).to.be.bignumber.not.equal(
        withdrawalLockDuration
      );
      const receipt = await staking.setWithdrawalLockDuration(
        newWithdrawalLockDuration,
        { from: owner }
      );
      expectEvent(receipt, "WithdrawalLockDurationSet", {
        value: newWithdrawalLockDuration,
        sender: owner,
      });
      await time.increase(PARAM_UPDATE_DELAY.sub(new BN(1)));
      expect(await staking.withdrawalLockDuration()).to.be.bignumber.equal(
        withdrawalLockDuration
      );
      await time.increase(2);
      expect(await staking.withdrawalLockDuration()).to.be.bignumber.equal(
        newWithdrawalLockDuration
      );
    });
    it("fails if not an owner", async () => {
      await expectRevert(
        staking.setWithdrawalLockDuration(new BN(1000), { from: user1 }),
        "Ownable: caller is not the owner"
      );
    });
    it("fails if greater than 30 days", async () => {
      await expectRevert(
        staking.setWithdrawalLockDuration(2592001, { from: owner }),
        `shouldn't be greater than 30 days`
      );
    });
  });

  describe("setWithdrawalUnlockDuration", () => {
    it("should set", async () => {
      const newWithdrawalUnlockDuration = new BN(10000);
      expect(await staking.withdrawalUnlockDuration()).to.be.bignumber.equal(
        withdrawalUnlockDuration
      );
      expect(newWithdrawalUnlockDuration).to.be.bignumber.not.equal(
        withdrawalUnlockDuration
      );
      const receipt = await staking.setWithdrawalUnlockDuration(
        newWithdrawalUnlockDuration,
        { from: owner }
      );
      expectEvent(receipt, "WithdrawalUnlockDurationSet", {
        value: newWithdrawalUnlockDuration,
        sender: owner,
      });
      await time.increase(PARAM_UPDATE_DELAY.sub(new BN(1)));
      expect(await staking.withdrawalUnlockDuration()).to.be.bignumber.equal(
        withdrawalUnlockDuration
      );
      await time.increase(2);
      expect(await staking.withdrawalUnlockDuration()).to.be.bignumber.equal(
        newWithdrawalUnlockDuration
      );
    });
    it("fails if not an owner", async () => {
      await expectRevert(
        staking.setWithdrawalUnlockDuration(new BN(10000), { from: user1 }),
        "Ownable: caller is not the owner"
      );
    });
    it("fails if less than 1 hour", async () => {
      await expectRevert(
        staking.setWithdrawalUnlockDuration(3599, { from: owner }),
        `shouldn't be less than 1 hour`
      );
    });
  });
});
