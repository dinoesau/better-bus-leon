/**
 * Offensive Assertion utility.
 * Rule 4: "Inside the Core, Assert and Crash"
 * Use this to verify system invariants that should never be false if the logic is correct.
 */
export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}
