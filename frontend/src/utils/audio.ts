// Shared helpers for the audio tag editor.
//
// The backend (`audiotags` package + `http/audiotags.go`) reads and writes
// tags for MP3 (ID3v2) and FLAC (Vorbis comments). These helpers gate the
// frontend "Edit tags" affordances to exactly that set — keep this list in
// lockstep with `audiotags.IsSupported` on the backend.

const TAGGABLE_SUFFIXES = [".mp3", ".flac"];

/** True when `name` is an audio file whose tags the backend can edit. */
export function isAudioTaggable(name: string): boolean {
  if (!name) return false;
  const lower = name.toLowerCase();
  return TAGGABLE_SUFFIXES.some((s) => lower.endsWith(s));
}
