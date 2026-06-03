// API client for the audio tag editor (MP3 / FLAC), backed by
// `http/audiotags.go`. Paths travel in the request body so a multi-file
// selection is one round-trip.

import { fetchJSON } from "./utils";

/** The normalized tag set returned by the read endpoint. Mirrors
 *  `audiotags.Tags` on the backend. */
export interface AudioTags {
  title: string;
  artist: string;
  album: string;
  albumArtist: string;
  year: string;
  track: string;
  trackTotal: string;
  disc: string;
  discTotal: string;
  genres: string[] | null;
  composer: string;
  comment: string;
  hasPicture: boolean;
  pictureMime?: string;
}

export interface AudioTagsReadResult {
  path: string;
  tags?: AudioTags;
  error?: string;
}

export interface AudioTagsWriteResult {
  path: string;
  ok: boolean;
  error?: string;
}

/** A partial change set. Only the keys present are changed; an explicit empty
 *  string (or empty `genres` array) clears the field; omitted keys are left
 *  untouched — which is what makes a batch edit apply only what you changed. */
export interface AudioTagSet {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
  year?: string;
  track?: string;
  trackTotal?: string;
  disc?: string;
  discTotal?: string;
  genres?: string[];
  composer?: string;
  comment?: string;
}

export type ArtworkAction = "keep" | "replace" | "remove";

/** Read the current tags of one or more audio files. */
export async function read(paths: string[]): Promise<AudioTagsReadResult[]> {
  const data = await fetchJSON<{ results: AudioTagsReadResult[] }>(
    "/api/audio-tags/read",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paths }),
    }
  );
  return data.results ?? [];
}

/**
 * Apply a change set to one or more audio files. `set` carries only the fields
 * the user changed. When `artwork` is "replace", pass the new cover as
 * `artworkFile`. Returns a per-file result so one bad file doesn't fail the
 * batch.
 *
 * Sent as multipart/form-data: a JSON `payload` part plus the optional
 * `artwork` image part. We deliberately don't set a Content-Type header so the
 * browser fills in the multipart boundary.
 */
export async function write(
  paths: string[],
  set: AudioTagSet,
  artwork: ArtworkAction = "keep",
  artworkFile?: Blob
): Promise<AudioTagsWriteResult[]> {
  // "replace" requires an actual file; if one wasn't provided, fall back to
  // "keep" so a caller mistake doesn't 400 the whole batch on the server.
  const effectiveArtwork: ArtworkAction =
    artwork === "replace" && !artworkFile ? "keep" : artwork;

  const form = new FormData();
  form.append(
    "payload",
    JSON.stringify({ paths, set, artwork: effectiveArtwork })
  );
  if (effectiveArtwork === "replace" && artworkFile) {
    form.append("artwork", artworkFile);
  }
  const data = await fetchJSON<{ results: AudioTagsWriteResult[] }>(
    "/api/audio-tags",
    { method: "PATCH", body: form }
  );
  return data.results ?? [];
}
