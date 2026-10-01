// An index of Blackmagic's shipped scripting docs (read-only): every method of
// DaVinciResolveScript.pyi tagged with its class and line, the TypedDicts and Literal aliases, the
// README's prose sections (with the Deprecated and Unsupported sections split per function so a
// hit steers away from example-style calls), and the CHANGELOG per version.
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';

export const PYI_NAME = 'DaVinciResolveScript.pyi';
export const README_NAME = 'README.md';
export const CHANGELOG_NAME = 'CHANGELOG.md';

export const DEPRECATED_SECTIONS: Record<string, 'deprecated' | 'unsupported'> = {
  'Deprecated Resolve API Functions': 'deprecated',
  'Deprecated Calling Conventions': 'deprecated',
  'Unsupported Resolve API Functions': 'unsupported',
  'Unsupported exportType types': 'unsupported',
};

export type DocKind = 'method' | 'typeddict' | 'alias' | 'section' | 'deprecated' | 'unsupported' | 'changelog';

export interface DocEntry {
  kind: DocKind;
  class?: string;
  name: string;
  signature?: string;
  text: string;
  file: string;
  line: number;
  tag?: 'deprecated' | 'unsupported';
}

export interface DocHit extends DocEntry {
  score: number;
}

export interface DocsSearchOk {
  ok: true;
  query: string;
  total_matches: number;
  results: DocHit[];
  docs_dir: string;
}

export interface DocsSearchFail {
  ok: false;
  error: string;
  docs_dir: string;
}

export const MAX_TEXT_CHARS = 600;

function clip(s: string): string {
  const t = s.trim();
  return t.length > MAX_TEXT_CHARS ? `${t.slice(0, MAX_TEXT_CHARS - 1)}…` : t;
}

const METHOD_RE = /^\tdef (\w+)\((.*?)\)(?: -> (.*?))?:\s*$/;
const CLASS_RE = /^class (\w+)(?:\((.*?)\))?:/;
const FUNC_TYPEDDICT_RE = /^(\w+) = TypedDict\(/;
const LITERAL_RE = /^(\w+) = Literal\[(.*)\]\s*$/;
const TYPEALIAS_RE = /^(\w+): TypeAlias = (\w+)\s*$/;
const FIELD_RE = /^\t(\w+): (.*?)\s*$/;
const FUNC_FIELD_RE = /^\t'([^']+)': (.*?),?\s*(?:#\s*(.*))?$/;
const DOC_RE = /^\s*"""(.*?)"""\s*$/;

function docOf(lines: string[], i: number): string {
  const m = DOC_RE.exec(lines[i + 1] ?? '');
  return m ? m[1] ?? '' : '';
}

export function indexPyi(text: string, file: string): DocEntry[] {
  const lines = text.split(/\r?\n/); // the shipped files may be CRLF on Windows
  const out: DocEntry[] = [];
  let cls: string | undefined;
  let dict: { name: string; line: number; fields: string[]; functional: boolean } | undefined;
  const flushDict = (): void => {
    if (!dict) return;
    out.push({ kind: 'typeddict', name: dict.name, text: `TypedDict fields: ${dict.fields.join('; ')}`, file, line: dict.line });
    dict = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const cm = CLASS_RE.exec(line);
    if (cm) {
      flushDict();
      const name = cm[1] ?? '';
      if ((cm[2] ?? '').startsWith('TypedDict')) {
        dict = { name, line: i + 1, fields: [], functional: false };
        cls = undefined;
      } else {
        cls = name;
      }
      continue;
    }
    const fd = FUNC_TYPEDDICT_RE.exec(line);
    if (fd) {
      flushDict();
      dict = { name: fd[1] ?? '', line: i + 1, fields: [], functional: true };
      cls = undefined;
      continue;
    }
    if (dict) {
      if (dict.functional) {
        const fm = FUNC_FIELD_RE.exec(line);
        if (fm) {
          dict.fields.push(`'${fm[1]}': ${fm[2]}${fm[3] ? ` (${fm[3]})` : ''}`);
          continue;
        }
        if (line.startsWith('}')) {
          flushDict();
          continue;
        }
      } else {
        const fm = FIELD_RE.exec(line);
        if (fm) {
          const doc = docOf(lines, i);
          dict.fields.push(`${fm[1]}: ${fm[2]}${doc ? ` (${doc})` : ''}`);
          continue;
        }
        if (line.trim() === '') {
          flushDict();
          continue;
        }
      }
    }
    const lm = LITERAL_RE.exec(line);
    if (lm) {
      out.push({ kind: 'alias', name: lm[1] ?? '', text: `Literal[${lm[2]}]`, file, line: i + 1 });
      continue;
    }
    const ta = TYPEALIAS_RE.exec(line);
    if (ta) {
      out.push({ kind: 'alias', name: ta[1] ?? '', text: `${ta[2]} alias. ${docOf(lines, i)}`.trim(), file, line: i + 1 });
      continue;
    }
    const mm = METHOD_RE.exec(line);
    if (mm && cls) {
      const name = mm[1] ?? '';
      const args = (mm[2] ?? '').replace(/^self,?\s*/, '');
      const ret = mm[3] ? ` -> ${mm[3]}` : '';
      out.push({
        kind: 'method',
        class: cls,
        name,
        signature: `${cls}.${name}(${args})${ret}`,
        text: docOf(lines, i),
        file,
        line: i + 1,
      });
    }
  }
  flushDict();
  return out;
}

const HEADING_RE = /^(#{1,3}) (.+?)\s*$/;
const FUNC_LINE_RE = /^([A-Za-z_][\w.]*)\((.*?)\)\s+-->\s+(.*)$/;
const BARE_IDENT_RE = /^[A-Z]\w*$/;

export function indexReadme(text: string, file: string): DocEntry[] {
  const lines = text.split(/\r?\n/); // the shipped files may be CRLF on Windows
  const out: DocEntry[] = [];
  let inFence = false;
  let section: { name: string; line: number; body: string[] } | undefined;
  const flush = (): void => {
    if (!section) return;
    const body = section.body.join('\n').trim();
    if (body) out.push({ kind: 'section', name: section.name, text: clip(body), file, line: section.line });
    section = undefined;
  };
  let group: string | undefined;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    const hm = inFence ? null : HEADING_RE.exec(line);
    if (hm) {
      flush();
      section = { name: hm[2] ?? '', line: i + 1, body: [] };
      group = undefined;
      continue;
    }
    if (!section) continue;
    const tag = DEPRECATED_SECTIONS[section.name];
    if (tag) {
      const fm = FUNC_LINE_RE.exec(line.trim());
      if (fm) {
        const name = fm[1] ?? '';
        const short = name.includes('.') ? name.slice(name.lastIndexOf('.') + 1) : name;
        const entry: DocEntry = { kind: tag, name: short, signature: `${name}(${fm[2]})`, text: clip(line.trim()), file, line: i + 1, tag };
        const cls = name.includes('.') ? name.slice(0, name.lastIndexOf('.')) : group;
        if (cls) entry.class = cls;
        out.push(entry);
        continue;
      }
      if (BARE_IDENT_RE.test(line.trim())) group = line.trim();
    }
    section.body.push(line);
  }
  flush();
  return out;
}

export function indexChangelog(text: string, file: string): DocEntry[] {
  const lines = text.split(/\r?\n/); // the shipped files may be CRLF on Windows
  const out: DocEntry[] = [];
  let section: { name: string; line: number; body: string[] } | undefined;
  const flush = (): void => {
    if (!section) return;
    out.push({ kind: 'changelog', name: section.name, text: clip(section.body.join('\n')), file, line: section.line });
    section = undefined;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const hm = /^## (.+?)\s*$/.exec(line);
    if (hm) {
      flush();
      section = { name: `Changelog ${hm[1]}`, line: i + 1, body: [] };
      continue;
    }
    if (section) section.body.push(line);
  }
  flush();
  return out;
}

/** Lowercase tokens of a query: split on non-alphanumerics and at camelCase boundaries. */
export function tokenize(query: string): string[] {
  const spaced = query.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
  const set = new Set<string>();
  for (const t of spaced.toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 1) set.add(t);
  for (const t of query.toLowerCase().split(/[^a-z0-9]+/)) if (t.length > 1) set.add(t);
  return [...set];
}

const KIND_RANK: Record<DocKind, number> = {
  method: 0,
  typeddict: 1,
  alias: 2,
  deprecated: 3,
  unsupported: 3,
  section: 4,
  changelog: 5,
};

export function scoreEntry(entry: DocEntry, tokens: string[], joined: string): number {
  const name = entry.name.toLowerCase();
  const cls = (entry.class ?? '').toLowerCase();
  const text = entry.text.toLowerCase();
  const sig = (entry.signature ?? '').toLowerCase();
  let score = 0;
  if (joined && name === joined) score += 10;
  if (joined && cls && `${cls}.${name}` === joined) score += 12;
  // A whole-query hit in the prose or signature (e.g. a method named in the CHANGELOG) outranks
  // partial name matches; short tokens such as "add" or "get" match too many names to count much.
  if (joined.length >= 4 && (text.includes(joined) || sig.includes(joined))) score += 4;
  for (const t of tokens) {
    const long = t.length >= 4;
    if (name === t) score += 5;
    else if (name.startsWith(t)) score += long ? 3 : 1;
    else if (name.includes(t) && long) score += 2;
    if (cls === t) score += 3;
    else if (cls.includes(t) && long) score += 1;
    if (text.includes(t)) score += 1;
    if (sig.includes(t)) score += 1;
  }
  return score;
}

export class DocsIndex {
  private entries: DocEntry[] | undefined;
  private loadError: string | undefined;

  constructor(readonly docsDir: string) {}

  /** Read the three files once; a missing folder is a recorded, non-fatal outcome. */
  async load(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
    if (this.entries) return { ok: true, count: this.entries.length };
    if (this.loadError) return { ok: false, error: this.loadError };
    const pyiPath = path.join(this.docsDir, PYI_NAME);
    let pyi: string;
    try {
      pyi = await fsp.readFile(pyiPath, 'utf8');
    } catch (err) {
      this.loadError = `Blackmagic scripting docs not found at ${this.docsDir} (${(err as Error).message}); install DaVinci Resolve 21.1 or set RLB_DOCS_DIR`;
      return { ok: false, error: this.loadError };
    }
    const entries = indexPyi(pyi, PYI_NAME);
    for (const [name, fn] of [
      [README_NAME, indexReadme],
      [CHANGELOG_NAME, indexChangelog],
    ] as const) {
      try {
        entries.push(...fn(await fsp.readFile(path.join(this.docsDir, name), 'utf8'), name));
      } catch {
        // optional companions
      }
    }
    this.entries = entries;
    return { ok: true, count: entries.length };
  }

  async search(query: string, limit: number): Promise<DocsSearchOk | DocsSearchFail> {
    const loaded = await this.load();
    if (!loaded.ok) return { ok: false, error: loaded.error, docs_dir: this.docsDir };
    const tokens = tokenize(query);
    const joined = query.trim().toLowerCase().replace(/\s+/g, '');
    const hits: DocHit[] = [];
    for (const e of this.entries ?? []) {
      const score = scoreEntry(e, tokens, joined);
      if (score > 0) hits.push({ ...e, score });
    }
    hits.sort((a, b) => b.score - a.score || KIND_RANK[a.kind] - KIND_RANK[b.kind] || a.line - b.line);
    return { ok: true, query, total_matches: hits.length, results: hits.slice(0, limit), docs_dir: this.docsDir };
  }
}
