export interface DecodedContractCall {
  contractId: string;
  functionName: string;
  args: unknown[];
}

export interface DecodedTransaction {
  hash: string;
  sourceAccount: string;
  fee: number;
  ledger: number | null;
  createdAt: string | null;
  successful: boolean;
  contractCall: DecodedContractCall | null;
  memo: string | null;
  rawMetadata: Record<string, unknown>;
}

export class SorobanBridgeTransactionDecoder {
  private readonly horizonUrl: string;

  constructor(horizonUrl = 'https://horizon-testnet.stellar.org') {
    this.horizonUrl = horizonUrl;
  }

  /**
   * Fetches and decodes a Soroban bridge transaction from Horizon.
   */
  async decode(txHash: string): Promise<DecodedTransaction> {
    const res = await fetch(`${this.horizonUrl}/transactions/${txHash}`);
    if (!res.ok) throw new Error(`Transaction not found: ${txHash} (${res.status})`);
    const raw = (await res.json()) as Record<string, unknown>;
    return this.parse(raw);
  }

  /**
   * Parses a raw Horizon transaction record into a readable format.
   */
  parse(raw: Record<string, unknown>): DecodedTransaction {
    return {
      hash: String(raw['hash'] ?? ''),
      sourceAccount: String(raw['source_account'] ?? ''),
      fee: Number(raw['fee_charged'] ?? 0),
      ledger: raw['ledger'] != null ? Number(raw['ledger']) : null,
      createdAt: raw['created_at'] != null ? String(raw['created_at']) : null,
      successful: Boolean(raw['successful']),
      contractCall: this.extractContractCall(raw),
      memo: raw['memo'] != null ? String(raw['memo']) : null,
      rawMetadata: raw,
    };
  }

  private extractContractCall(raw: Record<string, unknown>): DecodedContractCall | null {
    // Soroban contract invocations appear in the operations list
    const ops = raw['operations'] as Array<Record<string, unknown>> | undefined;
    if (!ops?.length) return null;

    const invoke = ops.find((op) => op['type'] === 'invoke_host_function');
    if (!invoke) return null;

    return {
      contractId: String(invoke['contract_id'] ?? ''),
      functionName: String(invoke['function'] ?? ''),
      args: Array.isArray(invoke['parameters']) ? (invoke['parameters'] as unknown[]) : [],
    };
  }
}
