// Logging: stderr (Claude Desktop keeps it in ~/Library/Logs/Claude/mcp-server-<name>.log on macOS,
// %APPDATA%\Claude\logs\ on Windows) plus an
// append-only file in the state directory, truncated when it passes MAX_LOG_BYTES. stdout is the
// MCP transport and is never written here.
import * as fs from 'node:fs';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const LOG_LEVELS: readonly LogLevel[] = ['debug', 'info', 'warn', 'error'];
const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export const MAX_LOG_BYTES = 5 * 1024 * 1024;
const SIZE_CHECK_EVERY = 50;

export interface Logger {
  readonly file: string | undefined;
  readonly level: LogLevel;
  debug(msg: string, data?: unknown): void;
  info(msg: string, data?: unknown): void;
  warn(msg: string, data?: unknown): void;
  error(msg: string, data?: unknown): void;
}

export interface LoggerOptions {
  file?: string | undefined;
  level?: LogLevel | undefined;
  /** Mirror every line to stderr (default true; tests turn it off). */
  stderr?: boolean | undefined;
  maxBytes?: number | undefined;
}

export function isLogLevel(value: unknown): value is LogLevel {
  return typeof value === 'string' && (LOG_LEVELS as readonly string[]).includes(value);
}

function formatData(data: unknown): string {
  if (data === undefined) return '';
  if (data instanceof Error) {
    const code = (data as NodeJS.ErrnoException).code;
    return ` ${data.name}: ${data.message}${code ? ` (${code})` : ''}`;
  }
  try {
    return ` ${JSON.stringify(data)}`;
  } catch {
    return ` ${String(data)}`;
  }
}

export function createLogger(opts: LoggerOptions = {}): Logger {
  const level = opts.level ?? 'info';
  const mirror = opts.stderr ?? true;
  const maxBytes = opts.maxBytes ?? MAX_LOG_BYTES;
  let file = opts.file;
  let writes = 0;

  function appendToFile(line: string): void {
    if (!file) return;
    try {
      fs.appendFileSync(file, line);
      writes += 1;
      if (writes % SIZE_CHECK_EVERY === 0) {
        const size = fs.statSync(file).size;
        if (size > maxBytes) {
          fs.truncateSync(file, 0);
          fs.appendFileSync(file, `${new Date().toISOString()} WARN log truncated at ${size} bytes\n`);
        }
      }
    } catch (err) {
      // Never let logging take the server down: drop the file sink after one stderr notice.
      const failed = file;
      file = undefined;
      if (mirror) console.error(`${new Date().toISOString()} WARN file log disabled (${failed}):${formatData(err)}`);
    }
  }

  function emit(lvl: LogLevel, msg: string, data?: unknown): void {
    if (RANK[lvl] < RANK[level]) return;
    const line = `${new Date().toISOString()} ${lvl.toUpperCase()} ${msg}${formatData(data)}\n`;
    if (mirror) console.error(line.trimEnd());
    appendToFile(line);
  }

  return {
    get file() {
      return file;
    },
    level,
    debug: (msg, data) => emit('debug', msg, data),
    info: (msg, data) => emit('info', msg, data),
    warn: (msg, data) => emit('warn', msg, data),
    error: (msg, data) => emit('error', msg, data),
  };
}

/** A logger that records nothing anywhere (tests and defaults). */
export const silentLogger: Logger = createLogger({ stderr: false, level: 'error' });
