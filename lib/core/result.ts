export type Result<T, E = Error> = 
  | { ok: true; value: T }
  | { ok: false; error: E };

/**
 * Offensive Assertion: Used in the core to narrow a Result.
 * If the result is 'false', it means a system invariant was broken.
 */
export function assertOk<T>(result: Result<T, unknown>): asserts result is { ok: true; value: T } {
  if (!result.ok) {
    throw result.error instanceof Error ? result.error : new Error(String(result.error));
  }
}

/**
 * Helper to convert a Zod SafeParse result into our Result pattern.
 * This keeps domain logic clean and consistent with the "Parse, Don't Validate" blog guide.
 */
export function fromZod<T>(
  result: 
    | { success: true; data: T } 
    | { success: false; error: { issues: { message: string }[] } }
): Result<T, string> {
  if (result.success) return { ok: true, value: result.data };
  return { ok: false, error: result.error.issues[0].message };
}
