export interface WalletSession {
  walletId: string;
  publicKey: string;
  connectedAt: Date;
  lastActiveAt: Date;
}

const sessions = new Map<string, WalletSession>();

export function createSession(walletId: string, publicKey: string): WalletSession {
  const session: WalletSession = {
    walletId,
    publicKey,
    connectedAt: new Date(),
    lastActiveAt: new Date(),
  };
  sessions.set(walletId, session);
  return session;
}

export function getSession(walletId: string): WalletSession | undefined {
  return sessions.get(walletId);
}

export function refreshSession(walletId: string): WalletSession | null {
  const session = sessions.get(walletId);
  if (!session) return null;
  session.lastActiveAt = new Date();
  return session;
}

export function removeSession(walletId: string): void {
  sessions.delete(walletId);
}

export function listActiveSessions(): WalletSession[] {
  return Array.from(sessions.values());
}