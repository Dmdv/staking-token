// SPDX-License-Identifier: MIT
pragma solidity 0.7.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./Staking.sol";

contract Governance is Pausable, Ownable, ReentrancyGuard {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    using Counters for Counters.Counter;
    using Address for address;

    uint256 private constant MINIMUM_STAKE_AMOUNT = 1000;
    uint private constant DEFAULT_VOTE_WEIGHT = 1;

    /**
     * @dev Emitted when an owner adds a proposal.
     * @param proposalOwner Owner address.
     * @param proposalsTotal Total proposals count.
     * @param proposalId The proposal ID created off-chain.
     * @param proposalTitle Title.
     * @param dateAdd Date when proposal has been added.
    */
    event ProposalAdded(
        address indexed proposalOwner,
        uint256 indexed proposalsTotal,
        uint256 indexed proposalId,
        string proposalTitle,
        uint256 dateAdd
    );

    /**
     * @dev Emitted when user makes a vote.
     * @param proposalId Proposal ID.
     * @param voter Voter address.
    */
    event VoteAdded(
        uint256 indexed proposalId,
        address indexed voter
    );

    /**
     * @dev An event emitted when a proposal has been activated
     * @param proposalId Proposal ID
    */
    event ProposalActivated(
        uint256 indexed proposalId
    );

    /**
     * @dev An event emitted when a proposal has been paused
     * @param proposalId Proposal ID
    */
    event ProposalPaused(
        uint256 indexed proposalId
    );

    /**
     * @dev An event emitted when a proposal has been closed
     * @param proposalId Proposal ID
    */
    event ProposalClosed(
        uint256 indexed proposalId
    );

    /**
     * @dev An event emitted when a proposal has been canceled
     * @param proposalId Proposal ID
    */
    event ProposalCanceled(
        uint256 indexed proposalId
    );

    /**
     * @dev An event emitted when a proposal has been resumed
     * @param proposalId Proposal ID
    */
    event ProposalResumed(
        uint256 indexed proposalId
    );

    /**
     * @dev An event emitted when total proposals count has changed
     * @param totalProposals Total proposals count
    */
    event TotalProposalsBaseIndexChanged(
        uint256 indexed totalProposals
    );

    /**
     * @dev Define the proposal active frame
     * @param proposalsBaseIndex starting index of the frame
     * @param proposalKeysLength ending index of the frame
    */
    event CalculationHasStarted(
        uint256 proposalsBaseIndex,
        uint256 proposalKeysLength
    );

    /**
     * @dev An event emitted when calculation has completed
     * @param sender Sender
    */
    event CalculationHasCompleted(
        address sender
    );

    /**
     * @dev An event emitted when winner has been found
     * @param proposalId Proposal ID which won the voting session.
     * @param winnersCount Total winners count from previous and current sessions.
    */
    event WinnerFound(
        uint256 proposalId,
        uint256 winnersCount
    );

    /// @notice An event emitted when a governance status has changed
    event GovernanceStatusChanged(
        GovernanceStatus prevStatus,
        GovernanceStatus currentStatus
    );

    /**
     * @dev Proposal status.
     * None: Missing proposal.
     * Active: Proposal can be voted for.
     * Paused: Proposal cannot be voted for until it's unpause.
     * Closed: Proposal cannot be voted forever. It's closed after votes calculations.
     * Cenceled: Proposal is removed from voting and it was never voted for.
    */
    enum ProposalStatus {
        None,
        Active,
        Paused,
        Closed,
        Canceled
    }

    /**
     * @dev The contract state.
     * DraftStarted: True when the owner starts the proposals draft. Nobody can vote or make votes count.
     * DraftCompleted: True when the owner ends the proposals draft. Nobody can vote or make votes count.
     * VotingStarted:True when the owner starts the voting. No new drafts will be accepted. Nobody can make votes count.
     * VotingCompleted:True when the owner stops the voting. No new drafts will be accepted.Nobody can make votes count.
     * SnapshotStarted: True when the voter starts votes calculations. No drafts will be accepted.
        Owner can start votes counting and unlocking of locked assets.
     * SnapshotCompleted: The contract is paused. Nothing can be done with the contact.
    */
    enum GovernanceStatus {
        DraftStarted,
        DraftCompleted,
        VotingStarted,
        VotingCompleted,
        SnapshotStarted,
        SnapshotCompleted
    }

    /**
     * @dev The proposal state.
     * proposalId: Proposal ID.
     * createdAt: Date when the proposal has been added.
     * proposalStatus: Proposal Status.
    */
    struct Proposal {
        uint256 proposalId;
        uint256 createdAt;
        ProposalStatus proposalStatus;
    }

    /**
     * @dev The Vote state.
     * voter: Voter address.
    */
    struct Vote {
        address voter;
    }

    Staking public staking;

    GovernanceStatus private governanceStatus;

    /// @dev Mapping: proposalId -> Proposal
    mapping(uint256 => Proposal) private proposals;
    /// @dev Array of proposalId
    uint256[] private proposalKeys;
    /// @dev Zero index of the current session frame
    uint256 public proposalsBaseIndex;
    /// @dev Mapping: proposalId -> Votes
    mapping(uint256 => Vote[]) private votes;
    /// @dev Mapping: proposalId -> Mapping: voter address -> boolean
    mapping(uint256 => mapping(address => bool)) private voters;
    /// @dev Mapping: proposalId -> SUM of votes
    mapping(uint256 => uint256) private results;
    /// @dev Array of winners
    uint256[] public winners;

    modifier whenStatus(GovernanceStatus _status) {
        require(
            governanceStatus == _status,
            "whenStatus: Action is not allowed with the current status."
        );
        _;
    }

    constructor(address _stakingAddress) {
        require(_stakingAddress.isContract(), "constructor: _stakingAddress is not a contract address");
        changeGovernanceStatus(GovernanceStatus.SnapshotCompleted);
        staking = Staking(_stakingAddress);
    }

    // Governance status management

    function getGovernanceStatus() public view returns (GovernanceStatus) {
        return governanceStatus;
    }

    function openProposalDraft()
        public
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.SnapshotCompleted)
    {
        changeGovernanceStatus(GovernanceStatus.DraftStarted);
        proposalsBaseIndex = proposalKeys.length;
        emit TotalProposalsBaseIndexChanged(proposalsBaseIndex);
    }

    function closeProposalDraft()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.DraftStarted)
    {
        changeGovernanceStatus(GovernanceStatus.DraftCompleted);
    }

    function openVoting()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.DraftCompleted)
    {
        changeGovernanceStatus(GovernanceStatus.VotingStarted);
    }

    function closeVoting()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.VotingStarted)
    {
        changeGovernanceStatus(GovernanceStatus.VotingCompleted);
    }

    function openCalculation()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.VotingCompleted)
    {
        changeGovernanceStatus(GovernanceStatus.SnapshotStarted);
    }

    function closeCalculation()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.SnapshotStarted)
    {
        changeGovernanceStatus(GovernanceStatus.SnapshotCompleted);
        require(concludeVoting() == true, "closeCalculation: failed to conclude voting");
        addWinningProposal();
    }

    // Proposals status management

    function pauseProposal(uint256 _proposalId)
        public
        whenNotPaused
        onlyOwner
        nonReentrant
    {
        require(_proposalId > 0, "addProposal: Id should be greater then 0");
        require(proposals[_proposalId].proposalId != 0, "pauseProposal: the proposal doesn't exist");

        proposals[_proposalId].proposalStatus = ProposalStatus.Paused;

        emit ProposalPaused(_proposalId);
    }

    function resumeProposal(uint256 _proposalId)
        public
        whenNotPaused
        onlyOwner
        nonReentrant
    {
        require(_proposalId > 0, "addProposal: Id should be greater then 0");
        require(proposals[_proposalId].proposalId != 0, "resumeProposal: the proposal doesn't exist");

        proposals[_proposalId].proposalStatus = ProposalStatus.Active;

        emit ProposalResumed(_proposalId);
    }

    function closeProposal(uint256 _proposalId)
        public
        whenNotPaused
        onlyOwner
        nonReentrant
    {
        require(_proposalId > 0, "addProposal: Id should be greater then 0");
        require(proposals[_proposalId].proposalId != 0, "closeProposal: the proposal doesn't exist");

        proposals[_proposalId].proposalStatus = ProposalStatus.Closed;

        emit ProposalClosed(_proposalId);
    }

    function cancelProposal(uint256 _proposalId)
        public
        whenNotPaused
        onlyOwner
        nonReentrant
    {
        require(_proposalId > 0, "addProposal: Id should be greater then 0");
        require(proposals[_proposalId].proposalId != 0, "cancelProposal: the proposal doesn't exist");
        require(proposals[_proposalId].proposalStatus == ProposalStatus.Active, "cancelProposal: can cancel only active proposal");

        proposals[_proposalId].proposalStatus = ProposalStatus.Canceled;

        emit ProposalCanceled(_proposalId);
    }

    // Proposals management

    /**
     * @dev This function adds proposal by owner.
     * @param _proposalId Externally generated proposal ID to track
     * @param _proposalTitle Describes proposal title
     * @return true if successful
     */
    function addProposal(uint256 _proposalId, string calldata _proposalTitle)
        external
        whenNotPaused
        onlyOwner
        whenStatus(GovernanceStatus.DraftStarted)
        nonReentrant
        returns (uint256)
    {
        require(_proposalId > 0, "addProposal: Id should be greater then 0");
        require(proposals[_proposalId].proposalId == 0, "addProposal: the proposal has already been added");

        proposalKeys.push(_proposalId);

        proposals[_proposalId] = Proposal({
            proposalId: _proposalId,
            createdAt: block.timestamp,
            proposalStatus: ProposalStatus.Active
        });

        emit ProposalAdded(msg.sender, proposalKeys.length, _proposalId, _proposalTitle, block.timestamp);
        emit ProposalActivated(_proposalId);
        return proposalKeys.length;
    }

    function getProposalStatus(uint256 proposalId)
        external view
        whenNotPaused
        onlyOwner
        returns(ProposalStatus)
    {
        return proposals[proposalId].proposalStatus;
    }

    function getActiveProposalsCount()
        external view
        whenNotPaused
        onlyOwner
        returns(uint256 count)
    {
        count = 0;

        // Travers all votes starting from the last session
        for (uint256 p = proposalsBaseIndex; p < proposalKeys.length; p++) {
            uint256 key = proposalKeys[p];
            if (proposals[key].proposalStatus == ProposalStatus.Active) {
                count = count.add(1);
            }
        }
    }

    function getPausedProposalsCount()
        external view
        whenNotPaused
        onlyOwner
        returns(uint256 count)
    {
        count = 0;

        // Travers all votes starting from the last session
        for (uint256 p = proposalsBaseIndex; p < proposalKeys.length; p++) {
            uint256 key = proposalKeys[p];
            if (proposals[key].proposalStatus == ProposalStatus.Paused) {
                count = count.add(1);
            }
        }
    }

    function getCurrentProposalsCount()
        external view
        whenNotPaused
        onlyOwner
        returns(uint256 count)
    {
        count = proposalKeys.length.sub(proposalsBaseIndex);
    }

    function getProposalIdByIndex(uint256 index)
        external view
        whenNotPaused
        onlyOwner
        returns(uint256 proposalId)
    {
        require(proposalKeys.length < proposalsBaseIndex.add(index), "getProposalIdByIndex: index out of range");
        Proposal memory proposal = proposals[proposalKeys[proposalsBaseIndex.add(index)]];
        return proposal.proposalId;
    }

    /**
     * @dev to cast a vote in valid proposalID
     * proposalID required to cast a vote
    */
    function vote(uint256 _proposalId)
        external
        whenNotPaused
        nonReentrant
        whenStatus(GovernanceStatus.VotingStarted)
        returns (bool)
    {
        require(_proposalId > 0, "vote: Id should be greater then 0");
        uint256 total = staking.totalUserBalance(msg.sender);
        require(total >= MINIMUM_STAKE_AMOUNT, "vote: Only user with minimum stake balance are eligible to vote");
        require(!voters[_proposalId][msg.sender], "vote: User already voted");
        require(proposals[_proposalId].proposalId != 0, "vote: the proposal doesn't exist");
        require(proposals[_proposalId].proposalStatus == ProposalStatus.Active, "vote:Proposal must be active to vote for it");

        votes[_proposalId].push(
            Vote(
                msg.sender
            ));

        voters[_proposalId][msg.sender] = true;

        emit VoteAdded(_proposalId, msg.sender);

        return true;
    }

    /**
     * @dev Computes the winning proposal taking all previous votes into account.
     */
    function addWinningProposal()
        internal
        onlyOwner
        whenStatus(GovernanceStatus.SnapshotCompleted)
    {
        uint256 winningVoteCount = 0;
        uint256 winningProposal = 0;

        for (uint p = proposalsBaseIndex; p < proposalKeys.length; p++) {
            uint256 key = proposalKeys[p];
            if (results[key] > winningVoteCount) {
                winningVoteCount = results[key];
                winningProposal = key;
            }
        }

        if (winners.length == 0) {
            winners.push(winningProposal);
        }
        else if (winners[winners.length - 1] != winningProposal){
            winners.push(winningProposal);
        }

        emit WinnerFound(winningProposal, winners.length);
    }

    /**
     * @dev This method is called to calculate votes during snapshot.
     * It traverses all votes for Proposals which are active and checks locked Tokens in Staking.
     * Some votes can be already with closed Proposal, so we skip it to avoid double unlocking.
     * Proposal statuses can be Active, Paused, Closed
     * After completion it saves the results of voting.
     * The vote is counted only when there's a lock
     * Voting result is recorded in the localState to be addressed later if required
     * @return true if successful
    */
    function calculateVotes()
        external
        whenNotPaused
        onlyOwner
        nonReentrant
        whenStatus(GovernanceStatus.SnapshotStarted)
        returns(bool)
    {
        emit CalculationHasStarted(proposalsBaseIndex, proposalKeys.length);

        // Travers all votes starting from the last session
        for (uint256 p = proposalsBaseIndex; p < proposalKeys.length; p++) {
            uint256 key = proposalKeys[p];

            require(proposals[key].proposalStatus == ProposalStatus.Active, "calculateVotes: Proposal must be active");

            uint256 numVotes = votes[key].length;
            uint256 totalVotes = 0;

            for (uint32 i = 0; i < numVotes; i++) {

                Vote memory currentVote = votes[key][i];

                if (staking.totalUserBalance(currentVote.voter) >= MINIMUM_STAKE_AMOUNT) {
                    totalVotes = totalVotes.add(DEFAULT_VOTE_WEIGHT);
                }
            }

            results[key] = totalVotes;
        }

        emit CalculationHasCompleted(msg.sender);

        return true;
    }

    /**
     * @dev This method is called conclude the current voting session
     * the Proposal status is changed to Closed
     * Proposal statuses can be Active, Paused, Closed
     * @return true if successful
    */
    function concludeVoting()
        internal
        onlyOwner
        whenStatus(GovernanceStatus.SnapshotCompleted)
        returns (bool)
    {
        // Travers all votes starting from the last session
        for (uint p = proposalsBaseIndex; p < proposalKeys.length; p = p.add(1)) {
            proposals[proposalKeys[p]].proposalStatus = ProposalStatus.Closed;
        }

        return true;
    }

    function changeGovernanceStatus(GovernanceStatus status)
        internal
        onlyOwner
    {
        GovernanceStatus prevStatus = governanceStatus;
        governanceStatus = status;
        emit GovernanceStatusChanged(prevStatus, governanceStatus);
    }

    /// @notice Returns voting result for a specific proposal
    function getResult(uint256 _proposalId)
        public view
        whenNotPaused
        whenStatus(GovernanceStatus.SnapshotCompleted)
        returns (uint256 count) {

        require(_proposalId > 0, "getResult: _proposalId must be positive big number");
        count = results[_proposalId];
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
}
