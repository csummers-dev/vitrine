interface IUser {
  id: number;
  username: string;
  password: string;
  scope: string;
  locale: string;
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
  aceEditorTheme: string;
}

type ViewModeType = "list" | "mosaic" | "mosaic gallery";

interface IUserForm {
  id?: number;
  username?: string;
  password?: string;
  scope?: string;
  locale?: string;
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
