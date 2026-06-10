interface ISettings {
  signup: boolean;
  createUserDir: boolean;
  hideLoginButton: boolean;
  rememberLastPage: boolean;
  minimumPasswordLength: number;
  /** Days before trashed items are auto-purged; 0 = keep forever (2.4.0). */
  trashRetentionDays: number;
  /** Checksum every background copy against its source; mismatch keeps the
   *  source and fails the transfer (2.4.0 Stage 4). Off by default. */
  verifyTransfers: boolean;
  userHomeBasePath: string;
  defaults: SettingsDefaults;
  authMethod: string;
  rules: any[];
  branding: SettingsBranding;
  tus: SettingsTus;
  shell: string[];
  commands: SettingsCommand;
}

interface SettingsDefaults {
  scope: string;
  viewMode: ViewModeType;
  singleClick: boolean;
  redirectAfterCopyMove: boolean;
  sorting: Sorting;
  perm: UserPermissions;
  commands: any[];
  hideDotfiles: boolean;
  dateFormat: boolean;
}

interface SettingsBranding {
  name: string;
  disableExternal: boolean;
  disableUsedPercentage: boolean;
  files: string;
  theme: UserTheme;
  color: string;
}

interface SettingsTus {
  chunkSize: number;
  retryCount: number;
}

interface SettingsCommand {
  after_copy?: string[];
  after_delete?: string[];
  after_rename?: string[];
  after_save?: string[];
  after_upload?: string[];
  before_copy?: string[];
  before_delete?: string[];
  before_rename?: string[];
  before_save?: string[];
  before_upload?: string[];
}

interface SettingsUnit {
  KB: number;
  MB: number;
  GB: number;
  TB: number;
}
