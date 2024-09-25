const { expect } = require("chai");
const { constants, balance, ether, BN } = require("@openzeppelin/test-helpers");
const { accounts, contract } = require("@openzeppelin/test-environment");

const CentralexToken = contract.fromArtifact("CentralexToken");

describe("CenX token ERC20 sanity checks using test-environment", () => {
  const [owner, user1, user2] = accounts;

  const name = "Centralex Token";
  const symbol = "CenX";
  let cenXToken;

  beforeEach(async () => {
    cenXToken = await CentralexToken.new({ from: owner });
    cenXToken.initialize(name, symbol, { from: owner });
  });

  it("has an address", async () => {
    const actual = await cenXToken.address;
    expect(actual).to.not.equal(constants.ZERO_ADDRESS);
  });

  it("has a name", async () => {
    const actual = await cenXToken.name();
    expect(actual).to.equal(name);
  });

  it("has a symbol", async () => {
    const actual = await cenXToken.symbol();
    expect(actual).to.equal(symbol);
  });

  it("has a totalSupply", async () => {
    const supply = await cenXToken.totalSupply();
    expect(supply.div(ether("1"))).to.be.bignumber.equal(new BN(5 * 1e8));
  });

  it("User can transfer token to another user", async () => {
    const balance = await cenXToken.balanceOf(owner, { from: owner });
    expect(balance.div(ether("1"))).to.be.bignumber.equal(new BN(5 * 1e8));

    await cenXToken.approve(owner, ether("10000"), { from: owner });
    await cenXToken.transferFrom(owner, user1, ether("1000"), { from: owner });

    const userBalance = await cenXToken.balanceOf(user1, { from: owner });
    expect(userBalance).to.be.bignumber.equal(ether("1000"));
  });
});
