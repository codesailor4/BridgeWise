/**
 * Integrity validator for Soroban bridge transfer payloads.
 *
 * Read-only checks that reject malformed or internally inconsistent transfer
 * data before it reaches execution, so a corrupted payload can't trigger an
 * invalid bridge transfer. Returns a structured result with one error per
 * broken rule rather than throwing on the first problem.
 */

export interface SorobanTransferPayload {
  transferId: string;
  /** Source Stellar account (G...). */
  sourceAccount: string;
  /** Destination account (G...) or contract (C...). */
  destinationAccount: string;
  /** "XLM" or a 1–12 char alphanumeric asset code. */
  assetCode: string;
  /** Positive decimal amount, as a string to preserve precision. */
  amount: string;
  /** Optional sequence / nonce; non-negative integer when present. */
  sequence?: number;
}

export interface IntegrityError {
  field: string;
  code: string;
  message: string;
}

export interface IntegrityResult {
  valid: boolean;
  errors: IntegrityError[];
}

// Stellar strkeys are base32 (A–Z, 2–7); accounts start with G, contracts with C.
const ACCOUNT_RE = /^G[A-Z2-7]{55}$/;
const ACCOUNT_OR_CONTRACT_RE = /^[GC][A-Z2-7]{55}$/;
const ASSET_CODE_RE = /^[A-Za-z0-9]{1,12}$/;

export function validateTransferPayload(payload: unknown): IntegrityResult {
  const errors: IntegrityError[] = [];
  const add = (field: string, code: string, message: string) =>
    errors.push({ field, code, message });

  if (typeof payload !== "object" || payload === null) {
    return { valid: false, errors: [{ field: "_", code: "NOT_AN_OBJECT", message: "Payload must be an object" }] };
  }
  const p = payload as Partial<SorobanTransferPayload>;

  if (!p.transferId || typeof p.transferId !== "string") {
    add("transferId", "MISSING_TRANSFER_ID", "transferId is required");
  }

  if (typeof p.sourceAccount !== "string" || !ACCOUNT_RE.test(p.sourceAccount)) {
    add("sourceAccount", "INVALID_SOURCE", "sourceAccount must be a valid Stellar account (G...)");
  }

  if (typeof p.destinationAccount !== "string" || !ACCOUNT_OR_CONTRACT_RE.test(p.destinationAccount)) {
    add("destinationAccount", "INVALID_DESTINATION", "destinationAccount must be a valid account (G...) or contract (C...)");
  }

  if (
    typeof p.sourceAccount === "string" &&
    p.sourceAccount === p.destinationAccount
  ) {
    add("destinationAccount", "SAME_SOURCE_DESTINATION", "source and destination must differ");
  }

  if (typeof p.assetCode !== "string" || !ASSET_CODE_RE.test(p.assetCode)) {
    add("assetCode", "INVALID_ASSET_CODE", "assetCode must be 1–12 alphanumeric characters");
  }

  if (typeof p.amount !== "string" || p.amount.trim() === "") {
    add("amount", "MISSING_AMOUNT", "amount is required");
  } else {
    const value = Number(p.amount);
    if (!Number.isFinite(value)) {
      add("amount", "NON_NUMERIC_AMOUNT", `amount is not a number: "${p.amount}"`);
    } else if (value <= 0) {
      add("amount", "NON_POSITIVE_AMOUNT", "amount must be greater than zero");
    }
  }

  if (p.sequence !== undefined && (!Number.isInteger(p.sequence) || p.sequence < 0)) {
    add("sequence", "INVALID_SEQUENCE", "sequence must be a non-negative integer");
  }

  return { valid: errors.length === 0, errors };
}
