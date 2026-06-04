import { describe, it, expect } from "vitest";
import { isAudioTaggable } from "@/utils/audio";

describe("isAudioTaggable", () => {
  it("accepts every taggable format (case-insensitive)", () => {
    for (const name of [
      "song.mp3",
      "Song.MP3",
      "track.flac",
      "Track.FLAC",
      "album.m4a",
      "Album.M4A",
      "clip.ogg",
      "clip.oga",
      "voice.opus",
      "a.b.c.mp3",
      "Artist - Title.flac",
    ]) {
      expect(isAudioTaggable(name), name).toBe(true);
    }
  });

  it("rejects formats the backend doesn't tag, and non-audio", () => {
    for (const name of [
      "song.wav",
      "song.aac", // raw AAC stream, not an MP4 container
      "song.aiff",
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
