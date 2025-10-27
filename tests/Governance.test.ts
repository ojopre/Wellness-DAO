import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_VOTING_THRESHOLD = 101;
const ERR_INVALID_QUORUM = 102;
const ERR_INVALID_PROPOSAL_DURATION = 103;
const ERR_INVALID_UPGRADE_PROPOSAL = 104;
const ERR_ALREADY_PAUSED = 106;
const ERR_NOT_PAUSED = 107;
const ERR_INVALID_PARAM = 108;
const ERR_PROPOSAL_ACTIVE = 109;
const ERR_PROPOSAL_NOT_FOUND = 110;
const ERR_INSUFFICIENT_BALANCE = 111;
const ERR_ALREADY_VOTED = 112;
const ERR_VOTING_ENDED = 113;
const ERR_VOTING_NOT_STARTED = 114;
const ERR_INVALID_CONTRACT_PRINCIPAL = 115;
const ERR_MAX_PROPOSALS_EXCEEDED = 116;
const ERR_INVALID_REWARD_RATE = 120;

interface Proposal {
  proposer: string;
  description: string;
  targetContract: string;
  newAddress?: string;
  paramKey?: string;
  paramValue?: number;
  startBlock: number;
  endBlock: number;
  yesVotes: number;
  noVotes: number;
  executed: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TokenMock {
  balances: Map<string, number> = new Map();
  totalSupply: number = 0;

  getBalance(caller: string): Result<number> {
    return { ok: true, value: this.balances.get(caller) || 0 };
  }

  getTotalSupply(): Result<number> {
    return { ok: true, value: this.totalSupply };
  }

  mint(amount: number, recipient: string): Result<boolean> {
    const bal = this.balances.get(recipient) || 0;
    this.balances.set(recipient, bal + amount);
    this.totalSupply += amount;
    return { ok: true, value: true };
  }

  transfer(amount: number, from: string, to: string): Result<boolean> {
    const balFrom = this.balances.get(from) || 0;
    if (balFrom < amount) return { ok: false, value: false };
    this.balances.set(from, balFrom - amount);
    const balTo = this.balances.get(to) || 0;
    this.balances.set(to, balTo + amount);
    return { ok: true, value: true };
  }
}

class GovernanceMock {
  state: {
    daoOwner: string;
    votingThreshold: number;
    quorumPercentage: number;
    proposalDuration: number;
    paused: boolean;
    nextProposalId: number;
    maxProposals: number;
    tokenContract: string;
    rewardRate: number;
    contractAddresses: Map<string, string>;
    proposals: Map<number, Proposal>;
    votes: Map<string, boolean>;
  };
  blockHeight: number = 0;
  caller: string = "ST1OWNER";
  tokenMock: TokenMock;

  constructor() {
    this.tokenMock = new TokenMock();
    this.state = {
      daoOwner: this.caller,
      votingThreshold: 51,
      quorumPercentage: 20,
      proposalDuration: 1440,
      paused: false,
      nextProposalId: 0,
      maxProposals: 100,
      tokenContract: "SP000000000000000000002Q6VF78.wellness-token",
      rewardRate: 5,
      contractAddresses: new Map(),
      proposals: new Map(),
      votes: new Map(),
    };
  }

  reset(): void {
    this.state = {
      daoOwner: this.caller,
      votingThreshold: 51,
      quorumPercentage: 20,
      proposalDuration: 1440,
      paused: false,
      nextProposalId: 0,
      maxProposals: 100,
      tokenContract: "SP000000000000000000002Q6VF78.wellness-token",
      rewardRate: 5,
      contractAddresses: new Map(),
      proposals: new Map(),
      votes: new Map(),
    };
    this.blockHeight = 0;
    this.tokenMock = new TokenMock();
  }

  getDaoOwner(): string {
    return this.state.daoOwner;
  }

  getVotingThreshold(): number {
    return this.state.votingThreshold;
  }

  getQuorumPercentage(): number {
    return this.state.quorumPercentage;
  }

  getProposalDuration(): number {
    return this.state.proposalDuration;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  getContractAddress(name: string): string | undefined {
    return this.state.contractAddresses.get(name);
  }

  getProposal(id: number): Proposal | undefined {
    return this.state.proposals.get(id);
  }

  getVote(id: number, voter: string): boolean | undefined {
    return this.state.votes.get(`${id}-${voter}`);
  }

  setDaoOwner(newOwner: string): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newOwner === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_CONTRACT_PRINCIPAL };
    this.state.daoOwner = newOwner;
    return { ok: true, value: true };
  }

  setVotingThreshold(newThreshold: number): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!(newThreshold > 50 && newThreshold <= 100)) return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    this.state.votingThreshold = newThreshold;
    return { ok: true, value: true };
  }

  setQuorumPercentage(newQuorum: number): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!(newQuorum > 0 && newQuorum <= 100)) return { ok: false, value: ERR_INVALID_QUORUM };
    this.state.quorumPercentage = newQuorum;
    return { ok: true, value: true };
  }

  setProposalDuration(newDuration: number): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newDuration <= 0) return { ok: false, value: ERR_INVALID_PROPOSAL_DURATION };
    this.state.proposalDuration = newDuration;
    return { ok: true, value: true };
  }

  setTokenContract(newContract: string): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newContract === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_CONTRACT_PRINCIPAL };
    this.state.tokenContract = newContract;
    return { ok: true, value: true };
  }

  setRewardRate(newRate: number): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!(newRate > 0 && newRate <= 10)) return { ok: false, value: ERR_INVALID_REWARD_RATE };
    this.state.rewardRate = newRate;
    return { ok: true, value: true };
  }

  pauseDao(): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseDao(): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.paused) return { ok: false, value: ERR_NOT_PAUSED };
    this.state.paused = false;
    return { ok: true, value: true };
  }

  createUpgradeProposal(description: string, target: string, newAddress: string): Result<number> {
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    if (this.state.nextProposalId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if ((this.tokenMock.getBalance(this.caller).value || 0) < 100) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (newAddress === "SP000000000000000000002Q6VF78") return { ok: false, value: ERR_INVALID_CONTRACT_PRINCIPAL };
    const id = this.state.nextProposalId;
    const start = this.blockHeight;
    const end = start + this.state.proposalDuration;
    this.state.proposals.set(id, {
      proposer: this.caller,
      description,
      targetContract: target,
      newAddress,
      startBlock: start,
      endBlock: end,
      yesVotes: 0,
      noVotes: 0,
      executed: false,
    });
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  createParamProposal(description: string, key: string, value: number): Result<number> {
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    if (this.state.nextProposalId >= this.state.maxProposals) return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if ((this.tokenMock.getBalance(this.caller).value || 0) < 100) return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    const id = this.state.nextProposalId;
    const start = this.blockHeight;
    const end = start + this.state.proposalDuration;
    this.state.proposals.set(id, {
      proposer: this.caller,
      description,
      targetContract: "",
      paramKey: key,
      paramValue: value,
      startBlock: start,
      endBlock: end,
      yesVotes: 0,
      noVotes: 0,
      executed: false,
    });
    this.state.nextProposalId++;
    return { ok: true, value: id };
  }

  voteOnProposal(id: number, vote: boolean): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    if (this.blockHeight < proposal.startBlock) return { ok: false, value: ERR_VOTING_NOT_STARTED };
    if (this.blockHeight >= proposal.endBlock) return { ok: false, value: ERR_VOTING_ENDED };
    if (this.state.votes.has(`${id}-${this.caller}`)) return { ok: false, value: ERR_ALREADY_VOTED };
    const balance = this.tokenMock.getBalance(this.caller).value || 0;
    this.state.proposals.set(id, {
      ...proposal,
      yesVotes: vote ? proposal.yesVotes + balance : proposal.yesVotes,
      noVotes: !vote ? proposal.noVotes + balance : proposal.noVotes,
    });
    this.state.votes.set(`${id}-${this.caller}`, vote);
    return { ok: true, value: true };
  }

  executeProposal(id: number): Result<boolean> {
    const proposal = this.state.proposals.get(id);
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.blockHeight < proposal.endBlock) return { ok: false, value: ERR_PROPOSAL_ACTIVE };
    if (proposal.executed) return { ok: false, value: ERR_ALREADY_PAUSED };
    const totalSupply = this.tokenMock.getTotalSupply().value;
    const totalVotes = proposal.yesVotes + proposal.noVotes;
    const quorum = (totalSupply * this.state.quorumPercentage) / 100;
    if (totalVotes < quorum) return { ok: false, value: ERR_INVALID_QUORUM };
    if (proposal.yesVotes <= proposal.noVotes) return { ok: false, value: ERR_INVALID_VOTING_THRESHOLD };
    if (proposal.newAddress) {
      this.state.contractAddresses.set(proposal.targetContract, proposal.newAddress);
    } else if (proposal.paramKey && proposal.paramValue !== undefined) {
      if (proposal.paramKey === "voting-threshold") this.state.votingThreshold = proposal.paramValue;
      else if (proposal.paramKey === "quorum-percentage") this.state.quorumPercentage = proposal.paramValue;
      else if (proposal.paramKey === "proposal-duration") this.state.proposalDuration = proposal.paramValue;
      else if (proposal.paramKey === "reward-rate") this.state.rewardRate = proposal.paramValue;
      else return { ok: false, value: ERR_INVALID_PARAM };
    } else {
      return { ok: false, value: ERR_INVALID_UPGRADE_PROPOSAL };
    }
    this.state.proposals.set(id, { ...proposal, executed: true });
    const reward = (proposal.yesVotes * this.state.rewardRate) / 100;
    this.tokenMock.mint(reward, proposal.proposer);
    return { ok: true, value: true };
  }

  emergencyWithdraw(amount: number, recipient: string): Result<boolean> {
    if (this.caller !== this.state.daoOwner) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.paused) return { ok: false, value: ERR_NOT_PAUSED };
    return this.tokenMock.transfer(amount, this.state.daoOwner, recipient);
  }
}

describe("Governance", () => {
  let contract: GovernanceMock;

  beforeEach(() => {
    contract = new GovernanceMock();
    contract.reset();
  });

  it("creates upgrade proposal successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    const result = contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.getProposal(0);
    expect(proposal?.description).toBe("Upgrade voting");
    expect(proposal?.targetContract).toBe("voting");
    expect(proposal?.newAddress).toBe("ST2NEW");
    expect(proposal?.startBlock).toBe(0);
    expect(proposal?.endBlock).toBe(1440);
  });

  it("rejects upgrade proposal when paused", () => {
    contract.pauseDao();
    const result = contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_PAUSED);
  });

  it("rejects upgrade proposal with insufficient balance", () => {
    contract.tokenMock.balances.set("ST1OWNER", 50);
    const result = contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("creates param proposal successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    const result = contract.createParamProposal("Change threshold", "voting-threshold", 75);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.getProposal(0);
    expect(proposal?.description).toBe("Change threshold");
    expect(proposal?.paramKey).toBe("voting-threshold");
    expect(proposal?.paramValue).toBe(75);
  });

  it("votes on proposal successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    contract.blockHeight = 100;
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.yesVotes).toBe(1000);
    expect(contract.getVote(0, "ST1OWNER")).toBe(true);
  });

  it("rejects vote if already voted", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    const result = contract.voteOnProposal(0, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("executes upgrade proposal successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.tokenMock.totalSupply = 5000;
    contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    contract.blockHeight = 1500;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getContractAddress("voting")).toBe("ST2NEW");
    expect(contract.getProposal(0)?.executed).toBe(true);
    expect(contract.tokenMock.balances.get("ST1OWNER")).toBe(1050);
  });

  it("executes param proposal successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.tokenMock.totalSupply = 5000;
    contract.createParamProposal("Change threshold", "voting-threshold", 75);
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    contract.blockHeight = 1500;
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getVotingThreshold()).toBe(75);
    expect(contract.getProposal(0)?.executed).toBe(true);
  });

  it("rejects execution if not owner", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.createUpgradeProposal("Upgrade voting", "voting", "ST2NEW");
    contract.blockHeight = 1500;
    contract.caller = "ST2FAKE";
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("performs emergency withdraw successfully", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    contract.pauseDao();
    const result = contract.emergencyWithdraw(500, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.tokenMock.balances.get("ST1OWNER")).toBe(500);
    expect(contract.tokenMock.balances.get("ST2RECIPIENT")).toBe(500);
  });

  it("rejects emergency withdraw when not paused", () => {
    contract.tokenMock.balances.set("ST1OWNER", 1000);
    const result = contract.emergencyWithdraw(500, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_PAUSED);
  });

  it("sets voting threshold successfully", () => {
    const result = contract.setVotingThreshold(75);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getVotingThreshold()).toBe(75);
  });

  it("rejects invalid voting threshold", () => {
    const result = contract.setVotingThreshold(40);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_VOTING_THRESHOLD);
  });

  it("sets dao owner successfully", () => {
    const result = contract.setDaoOwner("ST2NEW");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getDaoOwner()).toBe("ST2NEW");
  });

  it("rejects set dao owner by non-owner", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setDaoOwner("ST3NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});