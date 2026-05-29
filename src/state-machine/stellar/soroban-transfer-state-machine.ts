/**
 * Soroban bridge transfer state machine.
 *
 * Models the lifecycle of a cross-chain transfer through the Soroban bridge and
 * enforces that only valid transitions occur, so the many modules that touch a
 * transfer share one consistent notion of its state.
 */

export type SorobanTransferState =
  | "pending"
  | "locked"
  | "validated"
  | "submitted"
  | "confirmed"
  | "completed"
  | "failed"
  | "refunded";

/** Allowed transitions: state -> states reachable from it. */
const TRANSITIONS: Record<SorobanTransferState, readonly SorobanTransferState[]> = {
  pending: ["locked", "failed"],
  locked: ["validated", "failed", "refunded"],
  validated: ["submitted", "failed", "refunded"],
  submitted: ["confirmed", "failed"],
  confirmed: ["completed", "failed"],
  completed: [],
  failed: ["refunded"],
  refunded: [],
};

export interface TransitionRecord {
  from: SorobanTransferState;
  to: SorobanTransferState;
  at: number;
}

export class InvalidTransferTransitionError extends Error {
  constructor(
    public readonly from: SorobanTransferState,
    public readonly to: SorobanTransferState,
  ) {
    super(`Invalid Soroban transfer transition: ${from} -> ${to}`);
    this.name = "InvalidTransferTransitionError";
  }
}

export class SorobanTransferStateMachine {
  private state: SorobanTransferState;
  private readonly transitions: TransitionRecord[] = [];

  constructor(
    initialState: SorobanTransferState = "pending",
    private readonly now: () => number = () => Date.now(),
  ) {
    this.state = initialState;
  }

  /** Current lifecycle state. */
  get current(): SorobanTransferState {
    return this.state;
  }

  /** Ordered history of transitions taken. */
  get history(): readonly TransitionRecord[] {
    return this.transitions;
  }

  /** A terminal state has no outgoing transitions. */
  isTerminal(): boolean {
    return TRANSITIONS[this.state].length === 0;
  }

  /** Whether the machine may move to `next` from its current state. */
  canTransition(next: SorobanTransferState): boolean {
    return TRANSITIONS[this.state].includes(next);
  }

  /** States reachable from the current state. */
  nextStates(): readonly SorobanTransferState[] {
    return TRANSITIONS[this.state];
  }

  /**
   * Move to `next`, recording the transition. Throws
   * {@link InvalidTransferTransitionError} if the transition is not allowed.
   */
  transition(next: SorobanTransferState): SorobanTransferState {
    if (!this.canTransition(next)) {
      throw new InvalidTransferTransitionError(this.state, next);
    }
    this.transitions.push({ from: this.state, to: next, at: this.now() });
    this.state = next;
    return this.state;
  }
}
