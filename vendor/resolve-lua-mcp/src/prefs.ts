// Fusion.prefs: locating the newest profile file and parsing the bridge's two keys out of it.
// The file is a Lua table Fusion writes in hash order with tab indentation; string values escape
// only `\"`, `\\` and `\n` (measured on Resolve 21.1). Our two values are
// `<id>:<hex>` and `<hex>`, so a word-boundary regex with a closing quote is exact.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import * as z from 'zod/v4';

export const PREFS_FILE_NAME = 'Fusion.prefs';

export interface PrefsFile {
  path: string;
  mtimeMs: number;
}

/** The newest `<profilesDir>/<profile>/Fusion.prefs`, or undefined when there is none. */
export async function findPrefsFile(profilesDir: string): Promise<PrefsFile | undefined> {
  let names: string[];
  try {
    names = await fsp.readdir(profilesDir);
  } catch {
    return undefined;
  }
  let best: PrefsFile | undefined;
  for (const name of names) {
    const candidate = path.join(profilesDir, name, PREFS_FILE_NAME);
    try {
      const st = await fsp.stat(candidate);
      if (!st.isFile()) continue;
      if (!best || st.mtimeMs > best.mtimeMs) best = { path: candidate, mtimeMs: st.mtimeMs };
    } catch {
      // not a profile directory, or no prefs file in it
    }
  }
  return best;
}

// Our values never contain a quote or a line break, so a line break (LF or CR) before the closing quote
// means the line is still being written (or the key is missing its value). A CRLF file (Fusion on
// Windows is unmeasured) still parses: its CR sits after the closing quote.
const RESP_RE = /\bRLBResp = "([^"\r\n]*)"/g;
const SESSION_RE = /\bRLBSession = "([^"\r\n]*)"/g;

function lastMatch(re: RegExp, text: string): string | undefined {
  let last: string | undefined;
  re.lastIndex = 0;
  for (const m of text.matchAll(re)) last = m[1];
  return last;
}

export interface RawResp {
  id: string;
  hex: string;
}

/** The last complete `RLBResp = "<id>:<hex>"` in the file, split at the first colon. */
export function extractResp(text: string): RawResp | undefined {
  const value = lastMatch(RESP_RE, text);
  if (value === undefined || value === '') return undefined;
  const colon = value.indexOf(':');
  if (colon < 0) return { id: value, hex: '' };
  return { id: value.slice(0, colon), hex: value.slice(colon + 1) };
}

/** The last complete `RLBSession = "<hex>"`; empty string when the bridge cleared it. */
export function extractSessionHex(text: string): string | undefined {
  return lastMatch(SESSION_RE, text);
}

/** Lowercase-hex-of-UTF-8 to string. Throws on odd length or a non-hex character. */
export function decodeHex(hex: string): string {
  if (hex.length % 2 !== 0) throw new Error(`hex body has odd length ${hex.length}`);
  if (!/^[0-9a-fA-F]*$/.test(hex)) throw new Error('hex body contains a non-hex character');
  return Buffer.from(hex, 'hex').toString('utf8');
}

export const EnvelopeSchema = z.looseObject({
  v: z.literal(1),
  id: z.string(),
  session: z.string(),
  op: z.string(),
  ok: z.boolean(),
  bridge: z.string(),
  ms: z.number().optional(),
  truncated: z.boolean().optional(),
  result_bytes: z.number().optional(),
  prints_dropped: z.number().optional(),
  extra_returns: z.number().optional(),
  /** A string for Lua string errors; an object when the chunk raised a table. */
  error: z.unknown().optional(),
  prints: z.array(z.string()).optional(),
  result: z.unknown().optional(),
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const SessionSchema = z.looseObject({
  v: z.number().optional(),
  session: z.string(),
  state: z.enum(['running', 'stopped', 'error']),
  pid: z.number().optional(),
  started: z.number().optional(),
  stopped: z.number().optional(),
  product: z.string().optional(),
  version: z.string().optional(),
  profile: z.string().optional(),
  bridge: z.string().optional(),
  state_dir: z.string().optional(),
  state_dir_source: z.string().optional(),
  error: z.string().optional(),
});
export type Session = z.infer<typeof SessionSchema>;

function parseJson(hex: string, what: string): unknown {
  const text = decodeHex(hex);
  try {
    return JSON.parse(text) as unknown;
  } catch (err) {
    throw new Error(`${what} is not valid JSON: ${(err as Error).message}`);
  }
}

/** Decode and validate an RLBResp body. Throws with a message naming the defect. */
export function parseEnvelope(hex: string): Envelope {
  const parsed = EnvelopeSchema.safeParse(parseJson(hex, 'response'));
  if (!parsed.success) throw new Error(`response envelope is malformed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  const env = parsed.data;
  if (env.result === undefined) env.result = null;
  return env;
}

/** Decode and validate an RLBSession body. Throws with a message naming the defect. */
export function parseSession(hex: string): Session {
  const parsed = SessionSchema.safeParse(parseJson(hex, 'RLBSession'));
  if (!parsed.success) throw new Error(`RLBSession is malformed: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return parsed.data;
}
