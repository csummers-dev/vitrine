import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { startDownload } from "@/utils/download";
import { useLayoutStore } from "@/stores/layout";

// 4.0: folder and multi-item downloads zip straight away unless an admin
// turned on "Ask for archive format"; single files never see the prompt.

const setAsk = (on: boolean) => {
  window.FileBrowser = { ...window.FileBrowser, AskArchiveFormat: on };
};

describe("startDownload", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it("zips straight away when the setting is off", () => {
    setAsk(false);
    const archive = vi.fn();
    startDownload({ archive });
    expect(archive).toHaveBeenCalledWith("zip");
    expect(useLayoutStore().currentPromptName).toBeFalsy();
  });

  it("opens the format prompt when the setting is on", () => {
    setAsk(true);
    const archive = vi.fn();
    startDownload({ archive });
    const layout = useLayoutStore();
    expect(archive).not.toHaveBeenCalled();
    expect(layout.currentPromptName).toBe("download");
    // Picking a format closes the prompt and downloads in it.
    layout.currentPrompt?.confirm?.("targz");
    expect(archive).toHaveBeenCalledWith("targz");
    expect(layout.currentPromptName).toBeFalsy();
  });

  it("never prompts for a single file, in either mode", () => {
    for (const on of [false, true]) {
      setActivePinia(createPinia());
      setAsk(on);
      const file = vi.fn();
      const archive = vi.fn();
      startDownload({ file, archive });
      expect(file).toHaveBeenCalledOnce();
      expect(archive).not.toHaveBeenCalled();
      expect(useLayoutStore().currentPromptName).toBeFalsy();
    }
  });
});
