type Upload = {
  path: string;
  name: string;
  file: File | null;
  type: ResourceType;
  overwrite: boolean;
  totalBytes: number;
  sentBytes: number;
  rawProgress: {
    sentBytes: number;
  };
  /**
   * Set when the user cancels this upload from the dock (v1.3 H13).
   * `finishUpload()` reads it to reverse the file's byte accounting
   * instead of counting it as completed.
   */
  canceled?: boolean;
};

interface UploadEntry {
  name: string;
  size: number;
  isDir: boolean;
  fullPath?: string;
  to?: string;
  file?: File;
  overwrite?: boolean;
}

type UploadList = UploadEntry[];
