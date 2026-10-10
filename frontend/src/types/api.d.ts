type ApiMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";

type ApiContent =
  | Blob
  | File
  | Pick<ReadableStreamDefaultReader<Uint8Array>, "read">
  | "";

interface ApiOpts {
  method?: ApiMethod;
  headers?: object;
  body?: BodyInit | null;
  signal?: AbortSignal;
}

interface TusSettings {
  retryCount: number;
  chunkSize: number;
}

type ChecksumAlg = "md5" | "sha1" | "sha256" | "sha512";

interface Share {
  hash: string;
  path: string;
  expire?: number;
  /** Set when the share is password protected. */
  password_hash?: string;
  userID?: number;
  token?: string;
  username?: string;
  /** 4.0 4.2: usage. */
  views?: number;
  downloads?: number;
  /** Unix seconds of the last view or download. */
  lastAccessAt?: number;
  /** > 0: the link ends after this many downloads (1 = one-time). */
  maxDownloads?: number;
}

interface SearchParams {
  [key: string]: string;
}
