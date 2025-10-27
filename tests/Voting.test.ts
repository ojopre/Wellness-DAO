import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 200;
const ERR_INVALID_PROPOSAL = 201;
const ERR_PROPOSAL_NOT_FOUND = 203;
const ERR_VOTING_ENDED = 204;
const ERR_VOTING_NOT_STARTED = 205;
const ERR_ALREADY_VOTED = 206;
const ERR_INSUFFICIENT_BALANCE = 207;
const ERR_INVALID_DESCRIPTTION = 208;
const ERR_INVALID_BUDGET = 209;
const ERR_INVALID_DURATION = 210;
const ERR_PROPOSAL_ACTIVE = 211;
const ERR_QUORUM_NOT_MET = 212;
const ERR_MAX_PROPOSALS_EXCEEDED = 213;
const ERR_ALREADY_EXECUTED = 215;

interface Proposal {
  proposer: string;
  description: string;
  budget: number;
  duration: number;
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
}

class GovernanceMock {
  state: {
    daoOwner: string;
    paused: boolean;
    votingThreshold: number;
    quorumPercentage: number;
    proposalDuration: number;
  };

  constructor() {
    this.state = {
      daoOwner: "ST1OWNER",
      paused: false,
      votingThreshold: 51,
      quorumPercentage: 20,
      proposalDuration: 1440,
    };
  }

  getDaoOwner(): string {
    return this.state.daoOwner;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  getVotingParams(): Result<{
    votingThreshold: number;
    quorumPercentage: number;
    proposalDuration: number;
  }> {
    return {
      ok: true,
      value: {
        votingThreshold: this.state.votingThreshold,
        quorumPercentage: this.state.quorumPercentage,
        proposalDuration: this.state.proposalDuration,
      },
    };
  }
}

class VotingMock {
  state: {
    governanceContract: string;
    maxProposals: number;
    nextProposalId: number;
    proposals: Map<number, Proposal>;
    votes: Map<string, boolean>;
  };
  blockHeight: number = 0;
  caller: string = "ST1VOTER";
  tokenMock: TokenMock;
  governanceMock: GovernanceMock;

  constructor() {
    this.tokenMock = new TokenMock();
    this.governanceMock = new GovernanceMock();
    this.state = {
      governanceContract: ".governance",
      maxProposals: 500,
      nextProposalId: 0,
      proposals: new Map(),
      votes: new Map(),
    };
  }

  reset(): void {
    this.state = {
      governanceContract: ".governance",
      maxProposals: 500,
      nextProposalId: 0,
      proposals: new Map(),
      votes: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1VOTER";
    this.tokenMock = new TokenMock();
    this.governanceMock = new GovernanceMock();
  }

  getProposal(id: number): Proposal | undefined {
    return this.state.proposals.get(id);
  }

  getVote(id: number, voter: string): boolean | undefined {
    return this.state.votes.get(`${id}-${voter}`);
  }

  getGovernanceContract(): string {
    return this.state.governanceContract;
  }

  getProposalCount(): number {
    return this.state.nextProposalId;
  }

  setGovernanceContract(newGov: string): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.governanceContract = newGov;
    return { ok: true, value: true };
  }

  createProposal(
    description: string,
    budget: number,
    duration: number
  ): Result<number> {
    if (this.governanceMock.isPaused())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.nextProposalId >= this.state.maxProposals)
      return { ok: false, value: ERR_MAX_PROPOSALS_EXCEEDED };
    if ((this.tokenMock.getBalance(this.caller).value || 0) < 100)
      return { ok: false, value: ERR_INSUFFICIENT_BALANCE };
    if (description.length === 0 || description.length > 256)
      return { ok: false, value: ERR_INVALID_DESCRIPTTION };
    if (budget <= 0) return { ok: false, value: ERR_INVALID_BUDGET };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    const params = this.governanceMock.getVotingParams().value;
    const id = this.state.nextProposalId;
    const start = this.blockHeight;
    const end = start + params.proposalDuration;
    this.state.proposals.set(id, {
      proposer: this.caller,
      description,
      budget,
      duration,
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
    if (this.blockHeight < proposal.startBlock)
      return { ok: false, value: ERR_VOTING_NOT_STARTED };
    if (this.blockHeight >= proposal.endBlock)
      return { ok: false, value: ERR_VOTING_ENDED };
    if (this.state.votes.has(`${id}-${this.caller}`))
      return { ok: false, value: ERR_ALREADY_VOTED };
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
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.blockHeight < proposal.endBlock)
      return { ok: false, value: ERR_PROPOSAL_ACTIVE };
    if (proposal.executed) return { ok: false, value: ERR_ALREADY_EXECUTED };
    const params = this.governanceMock.getVotingParams().value;
    const totalSupply = this.tokenMock.getTotalSupply().value;
    const totalVotes = proposal.yesVotes + proposal.noVotes;
    const quorum = (totalSupply * params.quorumPercentage) / 100;
    if (totalVotes < quorum) return { ok: false, value: ERR_QUORUM_NOT_MET };
    if (proposal.yesVotes <= proposal.noVotes)
      return { ok: false, value: ERR_INVALID_PROPOSAL };
    this.state.proposals.set(id, { ...proposal, executed: true });
    return { ok: true, value: true };
  }
}

describe("Voting", () => {
  let contract: VotingMock;

  beforeEach(() => {
    contract = new VotingMock();
    contract.reset();
  });

  it("creates proposal successfully", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    const result = contract.createProposal("Yoga Program", 5000, 30);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const proposal = contract.getProposal(0);
    expect(proposal?.description).toBe("Yoga Program");
    expect(proposal?.budget).toBe(5000);
    expect(proposal?.duration).toBe(30);
    expect(proposal?.startBlock).toBe(0);
    expect(proposal?.endBlock).toBe(1440);
  });

  it("rejects proposal with insufficient balance", () => {
    contract.tokenMock.balances.set("ST1VOTER", 50);
    const result = contract.createProposal("Yoga Program", 5000, 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_BALANCE);
  });

  it("rejects proposal when paused", () => {
    contract.governanceMock.state.paused = true;
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    const result = contract.createProposal("Yoga Program", 5000, 30);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("votes on proposal successfully", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = 100;
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const proposal = contract.getProposal(0);
    expect(proposal?.yesVotes).toBe(1000);
    expect(contract.getVote(0, "ST1VOTER")).toBe(true);
  });

  it("rejects vote if already voted", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    const result = contract.voteOnProposal(0, false);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_VOTED);
  });

  it("rejects vote before start block", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = -1;
    const result = contract.voteOnProposal(0, true);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_VOTING_NOT_STARTED);
  });

  it("executes proposal successfully", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    contract.tokenMock.totalSupply = 5000;
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    contract.blockHeight = 1500;
    contract.caller = "ST1OWNER";
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getProposal(0)?.executed).toBe(true);
  });

  it("rejects execution by non-owner", () => {
    contract.tokenMock.balances.set("ST1VOTER", 1000);
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = 1500;
    contract.caller = "ST2FAKE";
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects execution if quorum not met", () => {
    contract.tokenMock.balances.set("ST1VOTER", 100);
    contract.tokenMock.totalSupply = 10000;
    contract.createProposal("Yoga Program", 5000, 30);
    contract.blockHeight = 100;
    contract.voteOnProposal(0, true);
    contract.blockHeight = 1500;
    contract.caller = "ST1OWNER";
    const result = contract.executeProposal(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_QUORUM_NOT_MET);
  });

  it("sets governance contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setGovernanceContract(".new-governance");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getGovernanceContract()).toBe(".new-governance");
  });

  it("rejects set governance by non-owner", () => {
    contract.caller = "ST2FAKE";
    const result = contract.setGovernanceContract(".new-governance");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});
