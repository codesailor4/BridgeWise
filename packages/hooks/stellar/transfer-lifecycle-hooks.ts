export type StellarTransferContext = {
  transferId: string;
  from: string;
  to: string;
  amount: string;
};

export type StellarTransferHook = (ctx: StellarTransferContext) => void | Promise<void>;

export class StellarTransferLifecycleHooks {
  private preHooks: StellarTransferHook[] = [];
  private postHooks: StellarTransferHook[] = [];

  onPreTransfer(hook: StellarTransferHook): void {
    this.preHooks.push(hook);
  }

  onPostTransfer(hook: StellarTransferHook): void {
    this.postHooks.push(hook);
  }

  async runPreTransfer(ctx: StellarTransferContext): Promise<void> {
    for (const hook of this.preHooks) await hook(ctx);
  }

  async runPostTransfer(ctx: StellarTransferContext): Promise<void> {
    for (const hook of this.postHooks) await hook(ctx);
  }
}
