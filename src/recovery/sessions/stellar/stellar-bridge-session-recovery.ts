export type StellarBridgeSession = {
  sessionId: string;
  transferId: string;
  status: "pending" | "completed" | "failed";
  updatedAt: number;
};

export class StellarBridgeSessionRecovery {
  private sessions = new Map<string, StellarBridgeSession>();

  persist(session: StellarBridgeSession): void {
    this.sessions.set(session.sessionId, session);
  }

  recoverInterruptedSessions(): StellarBridgeSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status === "pending");
  }
}
