import { z } from 'zod';

const EnvSchema = z.object({
  /**
   * Modern z.url() instead of z.string().url()
   * This aligns with the latest Zod API in your environment.
   */
  BUSES_API_BASE: z.url({ message: "BUSES_API_BASE must be a valid URL" }),
});

/**
 * Rule 3 & 4: Process Edge Validation (Assertion)
 * We parse the environment variables once at the process boundary.
 * If they are missing, we fail-fast because the system is in an impossible state.
 */
const result = EnvSchema.safeParse({
  BUSES_API_BASE: process.env.BUSES_API_BASE,
});

if (!result.success) {
  /**
   * Use the new standard for error trees (z.treeifyError) instead of the deprecated .format().
   * Provides the cleanest representation of validation failures in modern Zod.
   */
  const tree = z.treeifyError(result.error);
  console.error('❌ Invalid environment variables:', tree);
  throw new Error(`Invalid environment variables: ${JSON.stringify(tree)}`);
}

export const env = result.data;
