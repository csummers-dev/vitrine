import { describe, it, expect } from "vitest";
import { isAudioTaggable } from "@/utils/audio";

describe("isAudioTaggable", () => {
  it("accepts MP3 and FLAC (case-insensitive)", () => {
    for (const name of [
      "song.mp3",
      "Song.MP3",
      "track.flac",
      "Track.FLAC",
      "a.b.c.mp3",
      "Artist - Title.flac",
    ]) {
      expect(isAudioTaggable(name), name).toBe(true);
    }
  });

  it("rejects formats the backend can't write yet, and non-audio", () => {
    for (const name of [
      "song.m4a",
      "song.ogg",
      "song.wav",
      "song.aac",
      "song.opus",
      "cover.jpg",
      "notes.txt",
      "folder",
      "mp3", // no extension
      "",
    ]) {
      expect(isAudioTaggable(name), name).toBe(false);
    }
  });
});
