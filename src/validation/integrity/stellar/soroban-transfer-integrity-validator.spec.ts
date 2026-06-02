import { validateTransferPayload } from "./soroban-transfer-integrity-validator";

const SRC = "G" + "A".repeat(55);
const DEST = "G" + "B".repeat(55);
const CONTRACT = "C" + "A".repeat(55);

const valid = {
  transferId: "tx-1",
  sourceAccount: SRC,
  destinationAccount: DEST,
  assetCode: "USDC",
  amount: "10.5",
  sequence: 42,
};

describe("validateTransferPayload", () => {
  it("accepts a well-formed payload (account or contract destination)", () => {
    expect(validateTransferPayload(valid).valid).toBe(true);
    expect(validateTransferPayload({ ...valid, destinationAccount: CONTRACT }).valid).toBe(true);
  });

  it("rejects a non-object payload", () => {
    const result = validateTransferPayload(null);
    expect(result.valid).toBe(false);
    expect(result.errors[0].code).toBe("NOT_AN_OBJECT");
  });

  it("flags invalid addresses and identical source/destination", () => {
    const codes = validateTransferPayload({
      ...valid,
      sourceAccount: "not-an-address",
    }).errors.map((e) => e.code);
    expect(codes).toContain("INVALID_SOURCE");

    const sameCodes = validateTransferPayload({
      ...valid,
      destinationAccount: SRC,
    }).errors.map((e) => e.code);
    expect(sameCodes).toContain("SAME_SOURCE_DESTINATION");
  });

  it("rejects non-positive, non-numeric and missing amounts", () => {
    expect(validateTransferPayload({ ...valid, amount: "0" }).errors.map((e) => e.code)).toContain("NON_POSITIVE_AMOUNT");
    expect(validateTransferPayload({ ...valid, amount: "abc" }).errors.map((e) => e.code)).toContain("NON_NUMERIC_AMOUNT");
    expect(validateTransferPayload({ ...valid, amount: "" }).errors.map((e) => e.code)).toContain("MISSING_AMOUNT");
  });

  it("validates asset code and optional sequence", () => {
    expect(validateTransferPayload({ ...valid, assetCode: "TOO_LONG_ASSET_CODE" }).errors.map((e) => e.code)).toContain("INVALID_ASSET_CODE");
    expect(validateTransferPayload({ ...valid, sequence: -1 }).errors.map((e) => e.code)).toContain("INVALID_SEQUENCE");
  });
});
