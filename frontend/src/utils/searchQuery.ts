/**
 * parseQuery — turns the user's free-text input from the command
 * palette / Search.vue into the structured filter shape the
 * /api/search/recursive endpoint expects.
 *
 * Supported syntax (v1.3 Stage 2):
 *
 *   tag:work               → tags = ["work"]
 *   tag:"two words"        → tags = ["two words"]    (quoted values)
 *   tag:work tag:urgent    → tags = ["work","urgent"] (repeatable)
 *   ext:pdf                → ext  = "pdf"             (last wins)
 *   plain text             → q     = "plain text"     (joined w/ spaces)
 *   tag:a draft tag:b      → tags = ["a","b"], q = "draft"
 *
 * Added in 4.0 Phase 5.3 (saved searches):
 *
 *   type:image             → type = "image" (also video, audio, pdf, text,
 *                            archive, and plurals / photo / music / movie)
 *   size:>4GB  size:<10mb  → minSize / maxSize in bytes (1024-based units)
 *   added:7d   modified:2w → withinMs: modified in the last 7 days / 2
 *                            weeks (h, d, w, m = 30 days, y = 365 days).
 *                            The server only knows the modified time, so
 *                            "added" means "new or changed".
 *
 * Keys are case-insensitive (`TAG:foo` works). Empty values are
 * silently ignored (`tag:` parses to no tag, not a "" tag).
 * Unrecognized prefixes (`color:red`) are treated as free text — we'd
 * rather show the user "tag:foo size:>1mb" matched on basename than
 * silently drop the unrecognized half.
 *
 * Token-stream tokenizer rather than regex: regexes get ugly fast
 * with quoted-value handling, and the input is bounded (palette query
 * < ~200 chars). Single-quote support is intentional too — `tag:'foo bar'`
 * works the same as double-quote.
 *
 * Returns nil/zero-length values for unset filters so callers can
 * build URLs without conditional logic:
 *
 *   const url = new URLSearchParams();
 *   for (const t of parsed.tags) url.append("tag", t);
 *   if (parsed.ext) url.set("ext", parsed.ext);
 *   if (parsed.q) url.set("q", parsed.q);
 */
export interface ParsedQuery {
  /** Tag NAMES (not IDs). The caller is responsible for mapping
   *  names → IDs via the tags API before hitting search/recursive. */
  tags: string[];
  /** Single extension, no leading dot, lowercased. "" when unset. */
  ext: string;
  /** Free-text basename match. "" when unset. */
  q: string;
  /** File kind (image, video, audio, pdf, text, archive). Unset when absent. */
  type?: SearchKind;
  /** Inclusive size bounds in bytes. Unset when absent. */
  minSize?: number;
  maxSize?: number;
  /** Modified within this many milliseconds of now. Unset when absent. */
  withinMs?: number;
}

export type SearchKind =
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "text"
  | "archive";

const KIND_ALIASES: Record<string, SearchKind> = {
  image: "image",
  images: "image",
  photo: "image",
  photos: "image",
  picture: "image",
  pictures: "image",
  video: "video",
  videos: "video",
  movie: "video",
  movies: "video",
  audio: "audio",
  music: "audio",
  song: "audio",
  songs: "audio",
  pdf: "pdf",
  pdfs: "pdf",
  text: "text",
  archive: "archive",
  archives: "archive",
  zip: "archive",
};

const SIZE_UNITS: Record<string, number> = {
  "": 1,
  b: 1,
  k: 1024,
  kb: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  t: 1024 ** 4,
  tb: 1024 ** 4,
};

const HOUR = 3_600_000;
const AGE_UNITS: Record<string, number> = {
  h: HOUR,
  d: 24 * HOUR,
  w: 7 * 24 * HOUR,
  m: 30 * 24 * HOUR,
  y: 365 * 24 * HOUR,
};

/** "4GB" → bytes; null when it isn't a size. */
export function parseSize(text: string): number | null {
  const m = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/i.exec(text.trim());
  if (!m) return null;
  const unit = SIZE_UNITS[m[2].toLowerCase()];
  if (unit === undefined) return null;
  return Math.round(parseFloat(m[1]) * unit);
}

/** "7d" → milliseconds; null when it isn't an age. */
export function parseAge(text: string): number | null {
  const m = /^(\d+)\s*([hdwmy])$/i.exec(text.trim());
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n > 0 ? n * AGE_UNITS[m[2].toLowerCase()] : null;
}

/** True when the query needs the structured search endpoint. */
export function hasStructuredFilters(p: ParsedQuery): boolean {
  return (
    p.tags.length > 0 ||
    p.ext !== "" ||
    p.type !== undefined ||
    p.minSize !== undefined ||
    p.maxSize !== undefined ||
    p.withinMs !== undefined
  );
}

/** Token kinds produced by the internal tokenizer. */
type Token =
  | { kind: "key"; key: string; value: string }
  | { kind: "text"; value: string };

/**
 * Tokenize the input into a sequence of `key:value` or `text` tokens.
 * Whitespace is the separator; quoted spans (single or double) are
 * preserved as one token. Quotes inside values are stripped.
 */
function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  while (i < n) {
    // Skip whitespace.
    while (i < n && /\s/.test(input[i])) i++;
    if (i >= n) break;

    // Read a single token. A token is either:
    //   - quoted span: "..." or '...'
    //   - key:value where value may itself be quoted
    //   - bare run of non-whitespace
    let raw = "";
    let valueQuoted = false;

    while (i < n && !/\s/.test(input[i])) {
      const ch = input[i];

      if (ch === '"' || ch === "'") {
        // Consume quoted span — include nothing for the quote chars
        // themselves, just the inner content.
        const quote = ch;
        i++;
        while (i < n && input[i] !== quote) {
          raw += input[i];
          i++;
        }
        if (i < n) i++; // closing quote
        valueQuoted = true;
        continue;
      }
      raw += ch;
      i++;
    }

    if (!raw) continue;

    // Detect `key:value` shape. The first un-quoted colon splits;
    // if the value is quoted, we already consumed it without the colon
    // showing up in raw, so this `indexOf` only finds the key delimiter.
    const colon = raw.indexOf(":");
    if (colon > 0 && !valueQuoted) {
      // Key:value (unquoted value path).
      const key = raw.slice(0, colon).toLowerCase();
      const value = raw.slice(colon + 1);
      tokens.push({ kind: "key", key, value });
    } else if (colon > 0 && valueQuoted) {
      // Key with quoted value — split + treat the post-colon span as
      // the value (already de-quoted by the tokenizer above).
      const key = raw.slice(0, colon).toLowerCase();
      const value = raw.slice(colon + 1);
      tokens.push({ kind: "key", key, value });
    } else {
      tokens.push({ kind: "text", value: raw });
    }
  }

  return tokens;
}

/**
 * Parse a free-text query into structured filters.
 *
 * Recognized keys: `tag`, `ext`. Unknown keys are kept as free text
 * (preserving the `key:value` form) so users see what they typed
 * reflected in the basename match instead of silently disappearing.
 */
export function parseQuery(input: string): ParsedQuery {
  const out: ParsedQuery = { tags: [], ext: "", q: "" };
  if (!input) return out;

  const textParts: string[] = [];
  for (const tok of tokenize(input)) {
    if (tok.kind === "text") {
      textParts.push(tok.value);
      continue;
    }
    switch (tok.key) {
      case "tag":
        if (tok.value) out.tags.push(tok.value);
        break;
      case "ext":
        if (tok.value) {
          // Normalize: strip leading dot, lowercase. Last `ext:`
          // wins — "ext:pdf ext:doc" gives ext="doc".
          out.ext = tok.value.replace(/^\./, "").toLowerCase();
        }
        break;
      case "type":
      case "kind":
      case "is": {
        const kind = KIND_ALIASES[tok.value.toLowerCase()];
        if (kind) out.type = kind;
        else textParts.push(`${tok.key}:${tok.value}`);
        break;
      }
      case "size": {
        const m = /^(>=|<=|>|<)?(.+)$/.exec(tok.value);
        const bytes = m ? parseSize(m[2]) : null;
        if (m && bytes !== null) {
          if (m[1]?.startsWith("<")) out.maxSize = bytes;
          else out.minSize = bytes; // ">", ">=" or a bare size: at least
        } else {
          textParts.push(`${tok.key}:${tok.value}`);
        }
        break;
      }
      case "added":
      case "modified":
      case "changed": {
        const ms = parseAge(tok.value);
        if (ms !== null) out.withinMs = ms;
        else textParts.push(`${tok.key}:${tok.value}`);
        break;
      }
      default:
        // Unknown prefix → fall back to free text so the user sees
        // their input reflected in the search.
        textParts.push(`${tok.key}:${tok.value}`);
        break;
    }
  }
  out.q = textParts.join(" ");
  return out;
}

/**
 * Build a URL-search-params string ready to append to the
 * /api/search/recursive endpoint. Tags are passed as names here; the
 * caller is expected to substitute IDs before final dispatch (the
 * server takes IDs, not names — names live only on the frontend).
 *
 * Exposed alongside parseQuery so the wiring at the call site is
 * one line:
 *
 *   const url = `/api/search/recursive${path}?${buildSearchParams(parseQuery(input), tagNameToId)}`;
 */
export function buildSearchParams(
  parsed: ParsedQuery,
  tagNameToId: Record<string, number>,
  now: number = Date.now()
): string {
  const params = new URLSearchParams();
  for (const name of parsed.tags) {
    const id = tagNameToId[name.toLowerCase()];
    if (id !== undefined) params.append("tag", String(id));
  }
  if (parsed.ext) params.set("ext", parsed.ext);
  if (parsed.q) params.set("q", parsed.q);
  if (parsed.type) params.set("type", parsed.type);
  if (parsed.minSize !== undefined)
    params.set("minSize", String(parsed.minSize));
  if (parsed.maxSize !== undefined)
    params.set("maxSize", String(parsed.maxSize));
  if (parsed.withinMs !== undefined) {
    // Resolved at request time, so a saved "added:7d" stays a rolling week.
    params.set("newer", String(Math.floor((now - parsed.withinMs) / 1000)));
  }
  return params.toString();
}

const KIND_LABEL: Record<SearchKind, string> = {
  image: "Photos and images",
  video: "Videos",
  audio: "Audio",
  pdf: "PDFs",
  text: "Text files",
  archive: "Archives",
};

/** Bytes as a short size: 4294967296 → "4 GB". */
export function shortSize(bytes: number): string {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${Number.isInteger(n) ? n : n.toFixed(1)} ${units[i]}`;
}

/** Milliseconds as "7 days", "2 weeks", "1 hour"… */
function ageLabel(ms: number): string {
  const steps: Array<[number, string]> = [
    [AGE_UNITS.y, "year"],
    [AGE_UNITS.m, "month"],
    [AGE_UNITS.w, "week"],
    [AGE_UNITS.d, "day"],
    [AGE_UNITS.h, "hour"],
  ];
  for (const [size, word] of steps) {
    if (ms % size === 0) {
      const n = ms / size;
      return n === 1 ? `the last ${word}` : `the last ${n} ${word}s`;
    }
  }
  return `the last ${Math.round(ms / AGE_UNITS.h)} hours`;
}

/** A plain-language reading of a query, shown while editing a saved
 *  search: "Videos · over 4 GB · changed in the last week". */
export function describeQuery(p: ParsedQuery): string {
  const parts: string[] = [];
  parts.push(p.type ? KIND_LABEL[p.type] : p.ext ? `.${p.ext} files` : "");
  if (p.minSize !== undefined && p.maxSize !== undefined)
    parts.push(`${shortSize(p.minSize)} to ${shortSize(p.maxSize)}`);
  else if (p.minSize !== undefined)
    parts.push(`at least ${shortSize(p.minSize)}`);
  else if (p.maxSize !== undefined)
    parts.push(`at most ${shortSize(p.maxSize)}`);
  if (p.withinMs !== undefined)
    parts.push(`new or changed in ${ageLabel(p.withinMs)}`);
  if (p.tags.length > 0)
    parts.push(`tagged ${p.tags.map((t) => `“${t}”`).join(" and ")}`);
  if (p.q) parts.push(`name contains “${p.q}”`);
  const out = parts.filter(Boolean);
  if (out.length === 0) return "";
  if (!parts[0]) out[0] = out[0][0].toUpperCase() + out[0].slice(1);
  return out.join(" · ");
}
