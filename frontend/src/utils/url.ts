export function removeLastDir(url: string) {
  const arr = url.split("/");
  if (arr.pop() === "") {
    arr.pop();
  }

  return arr.join("/");
}

// this function is taken from mozilla
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/encodeURIComponent#Examples
export function encodeRFC5987ValueChars(str: string) {
  return (
    encodeURIComponent(str)
      // The following creates the sequences %27 %28 %29 %2A (Note that
      // the valid encoding of "*" is %2A, which necessitates calling
      // toUpperCase() to properly encode). Although RFC3986 reserves "!",
      // RFC5987 does not, so we do not need to escape it.
      .replace(
        /['()*]/g,
        (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
      )
      // The following are not required for percent-encoding per RFC5987,
      // so we can allow for a little better readability over the wire: |`^
      .replace(/%(7C|60|5E)/g, (str, hex) =>
        String.fromCharCode(parseInt(hex, 16))
      )
  );
}

export function encodePath(str: string) {
  return str
    .split("/")
    .map((v) => encodeURIComponent(v))
    .join("/");
}

/**
 * Build the resource URL for a NEW folder / file created inside `folderUrl`.
 * `folderUrl` is normalized to end in exactly one slash, the name is
 * URL-encoded, and folders get a trailing slash. Used by the inline new-item
 * input (pane B passes its own folder here) so the path math lives in one
 * tested place.
 */
export function buildCreatePath(
  folderUrl: string,
  name: string,
  isDir: boolean
): string {
  const base = folderUrl.replace(/\/?$/, "/");
  return base + encodeURIComponent(name) + (isDir ? "/" : "");
}

export default {
  encodeRFC5987ValueChars,
  removeLastDir,
  encodePath,
  buildCreatePath,
};
