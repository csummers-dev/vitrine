interface IUser {
  id: number;
  username: string;
  password: string;
  scope: string;
  perm: UserPermissions;
  commands: string[];
  rules: IRule[];
  lockPassword: boolean;
  hideDotfiles: boolean;
  singleClick: boolean;
  redirectAfterCopyMove: boolean;
  dateFormat: boolean;
  viewMode: ViewModeType;
  sorting?: Sorting;
  /**
   * Free-form per-user UI/feature preferences. Backed by a server-side
   * `map[string]json.RawMessage` so every key holds an opaque JSON value
   * the frontend owns end-to-end (the server treats the bag as a blob).
   *
   * Keys follow `feature.namespace.subkey` (lowercase, dot-separated)
   * to keep different features from colliding. Examples:
   *   - `view.mode.byFolder`        → `{ "/Documents": "mosaic" }`
   *   - `tags.recent`               → `["work", "todo"]`
   *   - `editor.fontSize`           → `14`
   *
   * Read + write via the `usePreferences` composable rather than
   * touching this field directly — the composable handles debounced
   * persistence and reactive reads.
   */
  preferences?: Record<string, unknown>;
}

type ViewModeType = "list" | "mosaic" | "mosaic gallery";

interface IUserForm {
  id?: number;
  username?: string;
  password?: string;
  scope?: string;
  perm?: UserPermissions;
  commands?: string[];
  rules?: IRule[];
  lockPassword?: boolean;
  hideDotfiles?: boolean;
  singleClick?: boolean;
  redirectAfterCopyMove?: boolean;
  dateFormat?: boolean;
}

/**
 * User permission flags. Named `UserPermissions` instead of `Permissions`
 * because the latter declaration-merges with the global DOM `Permissions`
 * interface (which has a `query()` method), making `keyof IUser["perm"]`
 * pull in DOM members.
 */
interface UserPermissions {
  admin: boolean;
  copy: boolean;
  create: boolean;
  delete: boolean;
  download: boolean;
  execute: boolean;
  modify: boolean;
  move: boolean;
  rename: boolean;
  share: boolean;
  shell: boolean;
  upload: boolean;
}

interface Sorting {
  by: string;
  asc: boolean;
}

/**
 * Multi-column sort preference (v1.3 S3-4). Primary always exists;
 * secondary is optional. Persisted in `user.preferences["sort"]` —
 * secondary lives client-side because the backend only accepts one
 * sort axis. We apply the secondary as an in-memory tiebreaker after
 * the fetched listing arrives, so server-side primary order is
 * preserved exactly.
 */
type SortKey = "name" | "modified" | "size" | "extension";
interface SortCriterion {
  by: SortKey;
  asc: boolean;
}
interface SortPreference {
  primary: SortCriterion;
  /** null = no secondary; sort by primary only. */
  secondary: SortCriterion | null;
}

interface IRule {
  allow: boolean;
  path: string;
  regex: boolean;
  regexp: IRegexp;
}

interface IRegexp {
  raw: string;
}

type UserTheme = "light" | "dark" | "";
