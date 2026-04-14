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
 * The strict schema for the entire location request.
 * Aligned with Rule 3: Parse, Don't Validate.
 */
const LocationRequestSchema = z.object({
  ruta: RouteIdSchema,
}).strict();

/**
 * Strict parser for the location request parameters.
 * Rejects duplicates and unrecognized parameters.
 */
export function parseLocationRequest(searchParams: URLSearchParams): Result<ValidRouteId, string> {
  const params: Record<string, string> = {};
  const duplicates: string[] = [];

  searchParams.forEach((value, key) => {
    if (key in params) {
      duplicates.push(key);
    }
    params[key] = value;
  });

  if (duplicates.length > 0) {
    return { ok: false, error: `Duplicate parameter: ${duplicates.join(', ')}` };
  }

  const result = LocationRequestSchema.safeParse(params);
  if (!result.success) {
    return fromZod(result);
  }

  return { ok: true, value: result.data.ruta };
}
