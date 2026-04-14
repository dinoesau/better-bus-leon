import { z } from 'zod';
import { VALID_ROUTE_IDS } from '@/lib/route-config';
import { Result, fromZod } from '../core/result';

/**
 * The "VIP Wristband" (Branded Type).
 */
export type ValidRouteId = string & { readonly __brand: unique symbol };

const RouteIdSchema = z
  .string({ message: "Missing route parameter" })
  .min(1, "Missing route parameter")
  .refine((val) => VALID_ROUTE_IDS.includes(val), {
    message: `Invalid route. Valid options: ${VALID_ROUTE_IDS.join(', ')}`
  })
  .transform((val) => val as ValidRouteId);

/**
 * The Bouncer: A Smart Constructor aligned with Rule 3 of the architectural guide.
 */
export function parseRouteId(id: unknown): Result<z.infer<typeof RouteIdSchema>, string> {
  return fromZod(RouteIdSchema.safeParse(id));
}
