import { z } from 'zod';
import { Result } from './core/result';

/**
 * Intelligent Schema: Parses a raw string row into a trusted BusLocation object.
 * Rule 3: "Parse, Don't Validate" - We transform the index-based array 
 * into a named object and perform coordinate math at the boundary.
 */
const BusLocationSchema = z.array(z.string())
  .min(22, { message: "Row has insufficient columns" })
  .transform((row) => ({
    id: row[11],
    // Coordinates are stored as integers (e.g., 2109986) in the upstream API
    latitude: parseFloat(row[3]) / 100000,
    longitude: -(parseFloat(row[4]) / 100000),
    hora: row[21],
  }))
  .pipe(
    z.object({
      id: z.string().min(1, "Missing bus ID"),
      latitude: z.number().min(20).max(22, "Latitude out of bounds for León"),
      longitude: z.number().min(-102).max(-100, "Longitude out of bounds for León"),
      hora: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, "Invalid date format"),
    })
  );

export type BusLocation = z.infer<typeof BusLocationSchema>;

export interface ParsedResult {
  pagination: string;
  data: string[][];
  filteredData: (string | number)[][];
  namedFilteredData: BusLocation[];
}

function base64ToString(base64: string) {
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function parseCustomPayload(dataString: string): Result<ParsedResult, Error> {
  if (!dataString) {
    return { ok: false, error: new Error('Empty payload') };
  }

  try {
    const decodedString = base64ToString(dataString);

    if (!decodedString.includes('|')) {
      console.log('[no rows] Decoded string:', decodedString); // Debugging output
      return { ok: false, error: new Error('Invalid payload format: missing row delimiter, base64: ' + dataString) };
    }

    const rawRows = decodedString.split('|');

    const footerRaw = rawRows.pop();
    if (!footerRaw) {
      console.log('[no footer] Decoded string:', decodedString); // Debugging output
      return { ok: false, error: new Error('Invalid payload format: missing footer') };
    }
    const paginationData = footerRaw.replace('&', '').trim();

    if (rawRows.length === 0) {
      console.log('[no data] Decoded string:', decodedString); // Debugging output
      return { ok: false, error: new Error('Invalid payload format: no data rows') };
    }

    // Remove the initial metadata (e.g., $3333) from the first row
    rawRows[0] = rawRows[0].replace(/^\$\d{4}/, '');

    const parsedRows = rawRows.map(row => row.split('#'));

    // Intelligent Parsing: Process the entire collection through Zod
    const result = z.array(BusLocationSchema).safeParse(parsedRows);

    if (!result.success) {
      console.log('[invalid rows] Decoded string:', decodedString); // Debugging output
      // Rule 2: Treat Errors as Values. We map Zod errors to a clear Result.
      const firstError = result.error.issues[0];
      const path = firstError.path.join('.');
      return { 
        ok: false, 
        error: new Error(`Parsing failure at [${path}]: ${firstError.message}`) 
      };
    }

    const namedFilteredData = result.data;

    /**
     * Legacy mappings kept for compatibility if needed elsewhere, 
     * but namedFilteredData is now the primary trusted source.
     */
    const filteredData = namedFilteredData.map(bus => [
      bus.id, bus.latitude, bus.longitude, bus.hora
    ]);

    return {
      ok: true,
      value: {
        pagination: paginationData,
        data: parsedRows,
        filteredData,
        namedFilteredData
      }
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err))
    };
  }
}
