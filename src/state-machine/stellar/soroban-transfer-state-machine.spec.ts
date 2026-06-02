import {
  SorobanTransferStateMachine,
  InvalidTransferTransitionError,
} from "./soroban-transfer-state-machine";

describe("SorobanTransferStateMachine", () => {
  it("starts in pending by default and exposes next states", () => {
    const sm = new SorobanTransferStateMachine();
    expect(sm.current).toBe("pending");
    expect(sm.nextStates()).toEqual(["locked", "failed"]);
    expect(sm.isTerminal()).toBe(false);
  });

  it("walks the happy path to completed and records history", () => {
    let t = 0;
    const sm = new SorobanTransferStateMachine("pending", () => ++t);
    sm.transition("locked");
    sm.transition("validated");
    sm.transition("submitted");
    sm.transition("confirmed");
    sm.transition("completed");
    expect(sm.current).toBe("completed");
    expect(sm.isTerminal()).toBe(true);
    expect(sm.history.map((h) => h.to)).toEqual([
      "locked",
      "validated",
      "submitted",
      "confirmed",
      "completed",
    ]);
    expect(sm.history[0]).toMatchObject({ from: "pending", to: "locked", at: 1 });
  });

  it("rejects invalid transitions", () => {
    const sm = new SorobanTransferStateMachine();
    expect(() => sm.transition("completed")).toThrow(InvalidTransferTransitionError);
    expect(sm.current).toBe("pending"); // unchanged after a rejected transition
  });

  it("supports the failure/refund branch", () => {
    const sm = new SorobanTransferStateMachine("locked");
    sm.transition("failed");
    expect(sm.canTransition("refunded")).toBe(true);
    sm.transition("refunded");
    expect(sm.isTerminal()).toBe(true);
  });
});
