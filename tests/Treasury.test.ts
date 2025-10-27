import { describe, it, expect, beforeEach } from "vitest";

const ERR_NOT_AUTHORIZED = 300;
const ERR_INSUFFICIENT_FUNDS = 301;
const ERR_INVALID_AMOUNT = 302;
const ERR_PROPOSAL_NOT_FOUND = 303;
const ERR_PROPOSAL_NOT_EXECUTED = 304;
const ERR_ALREADY_PAUSED = 305;
const ERR_NOT_PAUSED = 306;
const ERR_INVALID_RECIPIENT = 307;
const ERR_CONTRIBUTION_LOCKED = 311;
const ERR_INVALID_CONTRIBUTION = 312;

interface Contribution {
  amount: number;
  lockedUntil: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class TokenMock {
  balances: Map<string, number> = new Map();
  totalSupply: number = 0;

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
  state: { daoOwner: string } = { daoOwner: "ST1OWNER" };

  getDaoOwner(): string {
    return this.state.daoOwner;
  }
}

class VotingMock {
  state: { proposals: Map<number, { executed: boolean; budget: number }> } = {
    proposals: new Map(),
  };

  getProposal(
    id: number
  ): Result<{ executed: boolean; budget: number } | undefined> {
    const proposal = this.state.proposals.get(id);
    return { ok: true, value: proposal };
  }
}

class TreasuryMock {
  state: {
    governanceContract: string;
    votingContract: string;
    paused: boolean;
    totalFunds: number;
    contributions: Map<string, Contribution>;
  };
  blockHeight: number = 0;
  caller: string = "ST1USER";
  tokenMock: TokenMock;
  governanceMock: GovernanceMock;
  votingMock: VotingMock;

  constructor() {
    this.tokenMock = new TokenMock();
    this.governanceMock = new GovernanceMock();
    this.votingMock = new VotingMock();
    this.state = {
      governanceContract: ".governance",
      votingContract: ".voting",
      paused: false,
      totalFunds: 0,
      contributions: new Map(),
    };
  }

  reset(): void {
    this.state = {
      governanceContract: ".governance",
      votingContract: ".voting",
      paused: false,
      totalFunds: 0,
      contributions: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1USER";
    this.tokenMock = new TokenMock();
    this.governanceMock = new GovernanceMock();
    this.votingMock = new VotingMock();
  }

  getTotalFunds(): number {
    return this.state.totalFunds;
  }

  getContribution(contributor: string): Contribution | undefined {
    return this.state.contributions.get(contributor);
  }

  getGovernanceContract(): string {
    return this.state.governanceContract;
  }

  getVotingContract(): string {
    return this.state.votingContract;
  }

  isPaused(): boolean {
    return this.state.paused;
  }

  setGovernanceContract(newGov: string): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newGov === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    this.state.governanceContract = newGov;
    return { ok: true, value: true };
  }

  setVotingContract(newVoting: string): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (newVoting === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    this.state.votingContract = newVoting;
    return { ok: true, value: true };
  }

  pauseTreasury(): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    this.state.paused = true;
    return { ok: true, value: true };
  }

  unpauseTreasury(): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!this.state.paused) return { ok: false, value: ERR_NOT_PAUSED };
    this.state.paused = false;
    return { ok: true, value: true };
  }

  contribute(amount: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const result = this.tokenMock.transfer(amount, this.caller, "contract");
    if (!result.ok) return result;
    const current = this.state.contributions.get(this.caller) || {
      amount: 0,
      lockedUntil: 0,
    };
    this.state.contributions.set(this.caller, {
      amount: current.amount + amount,
      lockedUntil: this.blockHeight + 1440,
    });
    this.state.totalFunds += amount;
    return { ok: true, value: true };
  }

  withdrawContribution(amount: number): Result<boolean> {
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    if (amount <= 0) return { ok: false, value: ERR_INVALID_AMOUNT };
    const contrib = this.state.contributions.get(this.caller);
    if (!contrib) return { ok: false, value: ERR_INVALID_CONTRIBUTION };
    if (this.blockHeight < contrib.lockedUntil)
      return { ok: false, value: ERR_CONTRIBUTION_LOCKED };
    if (contrib.amount < amount)
      return { ok: false, value: ERR_INSUFFICIENT_FUNDS };
    const result = this.tokenMock.transfer(amount, "contract", this.caller);
    if (!result.ok) return result;
    this.state.contributions.set(this.caller, {
      amount: contrib.amount - amount,
      lockedUntil: contrib.lockedUntil,
    });
    this.state.totalFunds -= amount;
    return { ok: true, value: true };
  }

  disburseProposalFunds(
    proposalId: number,
    recipient: string
  ): Result<boolean> {
    if (this.caller !== this.governanceMock.getDaoOwner())
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (this.state.paused) return { ok: false, value: ERR_ALREADY_PAUSED };
    const proposal = this.votingMock.getProposal(proposalId).value;
    if (!proposal) return { ok: false, value: ERR_PROPOSAL_NOT_FOUND };
    if (!proposal.executed)
      return { ok: false, value: ERR_PROPOSAL_NOT_EXECUTED };
    if (recipient === "SP000000000000000000002Q6VF78")
      return { ok: false, value: ERR_INVALID_RECIPIENT };
    if (this.state.totalFunds < proposal.budget)
      return { ok: false, value: ERR_INSUFFICIENT_FUNDS };
    const result = this.tokenMock.transfer(
      proposal.budget,
      "contract",
      recipient
    );
    if (!result.ok) return result;
    this.state.totalFunds -= proposal.budget;
    return { ok: true, value: true };
  }
}

describe("Treasury", () => {
  let contract: TreasuryMock;

  beforeEach(() => {
    contract = new TreasuryMock();
    contract.reset();
  });

  it("contributes funds successfully", () => {
    contract.tokenMock.balances.set("ST1USER", 1000);
    const result = contract.contribute(500);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getTotalFunds()).toBe(500);
    expect(contract.getContribution("ST1USER")?.amount).toBe(500);
    expect(contract.getContribution("ST1USER")?.lockedUntil).toBe(1440);
  });

  it("rejects contribution when paused", () => {
    contract.caller = "ST1OWNER";
    contract.pauseTreasury();
    const result = contract.contribute(500);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_PAUSED);
  });

  it("withdraws contribution successfully", () => {
    contract.tokenMock.balances.set("ST1USER", 1000);
    contract.contribute(500);
    contract.blockHeight = 1500;
    const result = contract.withdrawContribution(300);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getTotalFunds()).toBe(200);
    expect(contract.getContribution("ST1USER")?.amount).toBe(200);
  });

  it("rejects withdrawal if locked", () => {
    contract.tokenMock.balances.set("ST1USER", 1000);
    contract.contribute(500);
    const result = contract.withdrawContribution(300);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CONTRIBUTION_LOCKED);
  });

  it("disburses proposal funds successfully", () => {
    contract.tokenMock.balances.set("contract", 10000);
    contract.state.totalFunds = 10000;
    contract.votingMock.state.proposals.set(0, {
      executed: true,
      budget: 5000,
    });
    contract.caller = "ST1OWNER";
    const result = contract.disburseProposalFunds(0, "ST2RECIPIENT");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getTotalFunds()).toBe(5000);
    expect(contract.tokenMock.balances.get("ST2RECIPIENT")).toBe(5000);
  });

  it("rejects disbursement by non-owner", () => {
    contract.votingMock.state.proposals.set(0, {
      executed: true,
      budget: 5000,
    });
    contract.caller = "ST2FAKE";
    const result = contract.disburseProposalFunds(0, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("rejects disbursement if not executed", () => {
    contract.tokenMock.balances.set("contract", 10000);
    contract.state.totalFunds = 10000;
    contract.votingMock.state.proposals.set(0, {
      executed: false,
      budget: 5000,
    });
    contract.caller = "ST1OWNER";
    const result = contract.disburseProposalFunds(0, "ST2RECIPIENT");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROPOSAL_NOT_EXECUTED);
  });

  it("sets governance contract successfully", () => {
    contract.caller = "ST1OWNER";
    const result = contract.setGovernanceContract(".new-governance");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.getGovernanceContract()).toBe(".new-governance");
  });

  it("rejects invalid recipient for disbursement", () => {
    contract.tokenMock.balances.set("contract", 10000);
    contract.state.totalFunds = 10000;
    contract.votingMock.state.proposals.set(0, {
      executed: true,
      budget: 5000,
    });
    contract.caller = "ST1OWNER";
    const result = contract.disburseProposalFunds(
      0,
      "SP000000000000000000002Q6VF78"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_RECIPIENT);
  });
});
