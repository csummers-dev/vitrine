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
 * Keys are case-insensitive (`TAG:foo` works). Empty values are
 * silently ignored (`tag:` parses to no tag, not a "" tag).
 * Unrecognized prefixes (`size:>1mb`) are treated as free text — we'd
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
  tagNameToId: Record<string, number>
): string {
  const params = new URLSearchParams();
  for (const name of parsed.tags) {
    const id = tagNameToId[name.toLowerCase()];
    if (id !== undefined) params.append("tag", String(id));
  }
  if (parsed.ext) params.set("ext", parsed.ext);
  if (parsed.q) params.set("q", parsed.q);
  return params.toString();
}
