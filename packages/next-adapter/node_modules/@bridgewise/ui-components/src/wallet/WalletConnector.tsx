import React from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { useMultiWalletContext } from './MultiWalletProvider';

export const WalletConnector: React.FC = () => {
  const {
    wallets,
    availableWallets,
    connectWallet,
    disconnectWallet,
    switchAccount,
    activeAccount,
    error,
    isRestoring,
  } = useMultiWalletContext();

  const connectedWalletIds = new Set(wallets.map((wallet) => wallet.wallet.id));
  const connectableWallets = availableWallets.filter((wallet) => !connectedWalletIds.has(wallet.id));

  return (
    <div>
      <h3>Wallet Connections</h3>
      {isRestoring && <div>Restoring previous wallet session...</div>}
      <ul>
        {wallets.map((w, i) => (
          <li key={w.walletType + i}>
            <strong>{w.walletType}</strong> - Connected: {w.connected ? 'Yes' : 'No'}
            <ul>
              {w.accounts.map((acc, idx) => (
                <li key={acc.address}>
                  {acc.address} {w.activeAccountIndex === idx ? '(Active)' : ''}
                  <button onClick={() => switchAccount(acc)}>Switch</button>
                </li>
              ))}
            </ul>
            <button onClick={() => disconnectWallet(w.walletType)}>Disconnect</button>
          </li>
        ))}
      </ul>
      {connectableWallets.map((wallet) => (
        <button key={wallet.id} onClick={() => void connectWallet(wallet.id)}>
          Connect {wallet.name}
        </button>
      ))}
      <div className="mt-4">
        <strong>Active Account:</strong> {activeAccount ? activeAccount.address : 'None'}
      </div>

      {activeAccount && (
        <div className="mt-3 p-3 border border-dashed rounded-lg inline-flex flex-col items-center max-w-xs">
          <span className="text-sm text-zinc-600 dark:text-zinc-300 mb-2">Scan wallet address QR</span>
          <QRCodeCanvas value={activeAccount.address} size={160} level="H" includeMargin={true} />
        </div>
      )}

      {error && <div style={{ color: 'red' }}>Error: {error.message}</div>}
    </div>
  );
};
