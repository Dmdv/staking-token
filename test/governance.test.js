const chai = require("chai");

const { expect } = chai;
const {
  constants,
  BN,
  expectRevert,
  expectEvent,
  ether,
} = require("@openzeppelin/test-helpers");
const { accounts, contract } = require("@openzeppelin/test-environment");
const chaiAsPromised = require("chai-as-promised");

chai.use(chaiAsPromised);

const Governance = contract.fromArtifact("Governance");
const CentralexToken = contract.fromArtifact("CentralexToken");
const Staking = contract.fromArtifact("Staking");

describe("Governance tests", () => {
  // users
  const [owner, user1, user2, user3, user4] = accounts;

  // contracts
  const name = "Centralex Token";
  const symbol = "CenX";

  let cenXToken;
  let gov;
  let staking;

  // Governance States
  const DraftStarted = new BN(0);
  const DraftCompleted = new BN(1);
  const VotingStarted = new BN(2);
  const VotingCompleted = new BN(3);
  const SnapshotStarted = new BN(4);
  const SnapshotCompleted = new BN(5);

  // ProposalStatus
  const None = new BN(0);
  const Active = new BN(1);
  const Paused = new BN(2);
  const Closed = new BN(3);
  const Canceled = new BN(4);

  // proposals
  const Proposal1Id = new BN(100);
  const Proposal1Title = "Proposal #1";
  const Proposal2Id = new BN(200);
  const Proposal2Title = "Proposal #2";
  const Proposal3Id = new BN(300);
  const Proposal3Title = "Proposal #3";
  const Proposal4Id = new BN(400);
  const Proposal4Title = "Proposal #4";
  const Proposal5Id = new BN(500);
  const Proposal5Title = "Proposal #5";
  const Proposal6Id = new BN(600);
  const Proposal6Title = "Proposal #6";

  const ether1000 = ether("1000");
  const ether10000 = ether("10000");
  const ether200 = ether("200");

  const fee = ether("0.03"); // 3%
  const withdrawalLockDuration = new BN(3600); // in seconds
  const withdrawalUnlockDuration = new BN(3600); // in seconds
  const rewardMaturityDuration = new BN(1209600); // 2 weeks in seconds
  const rewardSharePercent = ether("0.25"); // 25%

  beforeEach(async () => {
    cenXToken = await CentralexToken.new({ from: owner });
    cenXToken.initialize(name, symbol, { from: owner });

    staking = await Staking.new({ from: owner });
    staking.initialize(
      owner,
      cenXToken.address,
      fee.toString(),
      withdrawalLockDuration.toString(),
      withdrawalUnlockDuration.toString(),
      rewardMaturityDuration.toString(),
      rewardSharePercent.toString()
    );

    gov = await Governance.new(staking.address, { from: owner });
  });

  describe("Governance State tests", () => {
    it("has an address", async () => {
      const actual = await gov.address;
      expect(actual).to.not.equal(constants.ZERO_ADDRESS);
    });

    it("has status 'SnapshotCompleted' when contract has been created", async () => {
      const actual = await gov.getGovernanceStatus();
      expect(actual).to.be.bignumber.equal(SnapshotCompleted);
    });

    it("has status 'DraftStarted' status when invoked 'openProposalDraft'", async () => {
      await gov.openProposalDraft({ from: owner });
      const actual = await gov.getGovernanceStatus();
      expect(actual).to.be.bignumber.equal(DraftStarted);
    });

    it("Revert if status is 'SnapshotCompleted'", async () => {
      await expectRevert(
        gov.closeProposalDraft({ from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );

      await expectRevert(
        gov.openVoting({ from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );

      await expectRevert(
        gov.closeVoting({ from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );

      await expectRevert(
        gov.openCalculation({ from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );

      await expectRevert(
        gov.closeCalculation({ from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );
    });

    it("State machine working OK", async () => {
      await gov.openProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftStarted
      );

      await gov.closeProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftCompleted
      );

      await gov.openVoting({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        VotingStarted
      );

      await gov.closeVoting({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        VotingCompleted
      );

      await gov.openCalculation({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        SnapshotStarted
      );

      await gov.closeCalculation({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        SnapshotCompleted
      );
    });
  });

  describe("Governance proposal tests", () => {
    it("Owner can make a proposal", async () => {
      await gov.openProposalDraft({ from: owner });
      gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
    });

    it("Only owner can make a proposal", async () => {
      await gov.openProposalDraft({ from: owner });
      await expectRevert(
        gov.addProposal(Proposal1Id, Proposal1Title, { from: user1 }),
        "Ownable: caller is not the owner"
      );
    });

    it("Cannot add proposal with ID = 0", async () => {
      await gov.openProposalDraft({ from: owner });
      await expectRevert(
        gov.addProposal(new BN(0), Proposal1Title, { from: owner }),
        "addProposal: Id should be greater then 0"
      );
    });

    it("Cannot duplicate proposals", async () => {
      await gov.openProposalDraft({ from: owner });
      gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      await expectRevert(
        gov.addProposal(Proposal1Id, Proposal1Title, { from: owner }),
        "addProposal: the proposal has already been added"
      );
    });

    it("Owner can't make a proposal in other state other than 'DraftStarted'", async () => {
      await gov.openProposalDraft({ from: owner });
      await gov.closeProposalDraft({ from: owner });
      await expectRevert(
        gov.addProposal(Proposal1Id, Proposal1Title, { from: owner }),
        "whenStatus: Action is not allowed with the current status."
      );
    });

    it("After adding the proposal is active", async () => {
      await gov.openProposalDraft({ from: owner });

      let actual = await gov.getProposalStatus(Proposal1Id, { from: owner });
      expect(actual).to.be.bignumber.equal(None);

      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      actual = await gov.getProposalStatus(Proposal1Id, { from: owner });
      expect(actual).to.be.bignumber.equal(Active);
    });

    it("Proposals are added successfully", async () => {
      await gov.openProposalDraft({ from: owner });
      let actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });

      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(1));
      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(1));

      await gov.addProposal(Proposal2Id, Proposal2Title, { from: owner });

      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));

      await gov.addProposal(Proposal3Id, Proposal3Title, { from: owner });

      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(3));
      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(3));
    });

    it("Proposal can be paused and resumed", async () => {
      await gov.openProposalDraft({ from: owner });
      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      await gov.addProposal(Proposal2Id, Proposal2Title, { from: owner });

      let actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      await gov.pauseProposal(Proposal1Id, { from: owner });

      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(1));

      await gov.resumeProposal(Proposal1Id, { from: owner });

      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
    });

    it("Base index is shifted to the last index array after new proposal session has started", async () => {
      await gov.openProposalDraft({ from: owner });

      // Checking proposalBaseIndex

      let actual = await gov.proposalsBaseIndex.call({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      // Adding proposals

      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      await gov.addProposal(Proposal2Id, Proposal2Title, { from: owner });

      // Checking proposalBaseIndex

      actual = await gov.proposalsBaseIndex.call({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      await gov.closeProposalDraft({ from: owner });
      await gov.openVoting({ from: owner });
      await gov.closeVoting({ from: owner });
      await gov.openCalculation({ from: owner });
      await gov.closeCalculation({ from: owner });

      // Checking proposalBaseIndex

      actual = await gov.proposalsBaseIndex.call({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      // After this, proposalsBaseIndex is set to length

      await gov.openProposalDraft({ from: owner });
      actual = await gov.proposalsBaseIndex.call({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));

      await gov.addProposal(Proposal3Id, Proposal1Title, { from: owner });
      await gov.addProposal(Proposal4Id, Proposal2Title, { from: owner });

      actual = await gov.proposalsBaseIndex.call({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
    });

    it("After the snapshot all proposals are closed", async () => {
      let actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));

      await gov.openProposalDraft({ from: owner });

      // Adding proposals

      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      await gov.addProposal(Proposal2Id, Proposal2Title, { from: owner });

      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));

      await gov.closeProposalDraft({ from: owner });
      await gov.openVoting({ from: owner });
      await gov.closeVoting({ from: owner });
      await gov.openCalculation({ from: owner });
      await gov.closeCalculation({ from: owner });

      actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(2));
      actual = await gov.getPausedProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
      actual = await gov.getActiveProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(0));
    });
  });

  describe("Governance voting tests", () => {
    beforeEach(async () => {
      await cenXToken.mint(user1, ether1000, { from: owner });
      await cenXToken.mint(user2, ether1000, { from: owner });
      await cenXToken.mint(user3, ether1000, { from: owner });
      await cenXToken.mint(user4, ether1000, { from: owner });
      await cenXToken.mint(owner, ether1000, { from: owner });
      await cenXToken.approve(staking.address, ether10000, { from: user1 });
      await cenXToken.approve(staking.address, ether10000, { from: user2 });
      await cenXToken.approve(staking.address, ether10000, { from: user3 });
      await cenXToken.approve(staking.address, ether10000, { from: user4 });
      await cenXToken.approve(staking.address, ether10000, { from: owner });
      await staking.methods["deposit(uint256)"](ether1000, { from: user2 });
      await staking.methods["deposit(uint256)"](ether1000, { from: user3 });
      await staking.methods["deposit(uint256)"](ether1000, { from: user4 });

      await addProposals();

      await gov.openVoting({ from: owner });
    });

    it("Users can vote", async () => {
      const receipt = await gov.vote(Proposal1Id, { from: user2 });
      expectEvent(receipt, "VoteAdded", {
        proposalId: Proposal1Id,
        voter: user2,
      });
    });

    it("Owner can calculates votes", async () => {
      await voteAndStartCalculation(Proposal1Id);
      await calculateAndCloseCalculation(0, 3, 3, Proposal1Id, 1);
    });

    it("User cannot vote without staked amount", async () => {
      expectRevert(
        gov.vote(Proposal1Id, { from: user1 }),
        "vote: Only user with minimum stake balance are eligible to vote"
      );
    });

    it("User cannot vote for paused or closed proposal", async () => {
      await gov.pauseProposal(Proposal1Id, { from: owner });
      expectRevert(
        gov.vote(Proposal1Id, { from: user2 }),
        "vote:Proposal must be active to vote for it"
      );
      await gov.resumeProposal(Proposal1Id, { from: owner });
      await gov.vote(Proposal1Id, { from: user2 });
    });

    it("User cannot vote when governance is paused", async () => {
      await gov.pause({ from: owner });
      expectRevert(gov.vote(Proposal1Id, { from: user2 }), "Pausable: paused");
      await gov.unpause({ from: owner });
      await gov.vote(Proposal1Id, { from: user2 });
    });

    it("User vote cannot be counted if the user has withdrawn stakes", async () => {
      await voteAndStartCalculation(Proposal1Id);
      await staking.makeForcedWithdrawal(1, { from: user2 });
      await calculateAndCloseCalculation(0, 3, 2, Proposal1Id, 1);
    });

    it("Votes for previous sessions are not counted", async () => {
      await voteAndStartCalculation(Proposal1Id);
      await calculateAndCloseCalculation(0, 3, 3, Proposal1Id, 1);
      await addProposals2();

      await gov.openVoting({ from: owner });

      const receipt = await gov.vote(Proposal5Id, { from: user3 });
      expectEvent(receipt, "VoteAdded", {
        proposalId: Proposal5Id,
        voter: user3,
      });

      await gov.closeVoting({ from: owner });
      await gov.openCalculation({ from: owner });

      await calculateAndCloseCalculation(3, 6, 3, Proposal5Id, 2);
    });

    const calculateAndCloseCalculation = async (
      baseIndex,
      length,
      expectedID1Count,
      winnerId,
      winnersCount
    ) => {
      let receipt = await gov.calculateVotes({ from: owner });

      expectEvent(receipt, "CalculationHasStarted", {
        proposalsBaseIndex: new BN(baseIndex),
        proposalKeysLength: new BN(length),
      });

      expectEvent(receipt, "CalculationHasCompleted", {
        sender: owner,
      });

      receipt = await gov.closeCalculation({ from: owner });
      const count = await gov.getResult(Proposal1Id, { from: owner });
      expect(count).to.be.bignumber.equal(new BN(expectedID1Count));

      expectEvent(receipt, "WinnerFound", {
        proposalId: winnerId,
        winnersCount: new BN(winnersCount),
      });
    };

    const voteAndStartCalculation = async (id) => {
      await staking.setFee(new BN(0), { from: owner });

      let receipt = await gov.vote(id, { from: user2 });
      expectEvent(receipt, "VoteAdded", {
        proposalId: Proposal1Id,
        voter: user2,
      });

      receipt = await gov.vote(id, { from: user3 });
      expectEvent(receipt, "VoteAdded", {
        proposalId: Proposal1Id,
        voter: user3,
      });

      receipt = await gov.vote(id, { from: user4 });
      expectEvent(receipt, "VoteAdded", {
        proposalId: Proposal1Id,
        voter: user4,
      });

      await gov.closeVoting({ from: owner });
      await gov.openCalculation({ from: owner });
    };

    const addProposals = async () => {
      await gov.openProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftStarted
      );

      await gov.addProposal(Proposal1Id, Proposal1Title, { from: owner });
      await gov.addProposal(Proposal2Id, Proposal2Title, { from: owner });
      await gov.addProposal(Proposal3Id, Proposal3Title, { from: owner });

      await gov.closeProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftCompleted
      );

      const actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(3));
    };

    const addProposals2 = async () => {
      await gov.openProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftStarted
      );

      await gov.addProposal(Proposal4Id, Proposal4Title, { from: owner });
      await gov.addProposal(Proposal5Id, Proposal5Title, { from: owner });
      await gov.addProposal(Proposal6Id, Proposal6Title, { from: owner });

      await gov.closeProposalDraft({ from: owner });
      expect(await gov.getGovernanceStatus()).to.be.bignumber.equal(
        DraftCompleted
      );

      const actual = await gov.getCurrentProposalsCount({ from: owner });
      expect(actual).to.be.bignumber.equal(new BN(3));
    };
  });
});
