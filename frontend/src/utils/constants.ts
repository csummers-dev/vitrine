// Fallback applies when the backend's `settings.Branding.Name` is empty
// (fresh install before quickSetup, or admin cleared the field). Lowercase
// is intentional — this is the app's wordmark, not a sentence.
const name: string = window.FileBrowser.Name || "filebrowser pretty";
const disableExternal: boolean = window.FileBrowser.DisableExternal;
const disableUsedPercentage: boolean = window.FileBrowser.DisableUsedPercentage;
const baseURL: string = window.FileBrowser.BaseURL;
const staticURL: string = window.FileBrowser.StaticURL;
const recaptcha: string = window.FileBrowser.ReCaptcha;
const recaptchaKey: string = window.FileBrowser.ReCaptchaKey;
const signup: boolean = window.FileBrowser.Signup;
const version: string = window.FileBrowser.Version;
const logoURL = `${staticURL}/img/logo.svg`;
const noAuth: boolean = window.FileBrowser.NoAuth;
const authMethod = window.FileBrowser.AuthMethod;
const logoutPage: string = window.FileBrowser.LogoutPage;
const loginPage: boolean = window.FileBrowser.LoginPage;
const theme: UserTheme = window.FileBrowser.Theme;
const enableThumbs: boolean = window.FileBrowser.EnableThumbs;
const resizePreview: boolean = window.FileBrowser.ResizePreview;
const enableExec: boolean = window.FileBrowser.EnableExec;
const tusSettings = window.FileBrowser.TusSettings;
const origin = window.location.origin;
const tusEndpoint = `/api/tus`;
const hideLoginButton = window.FileBrowser.HideLoginButton;
// Zip extraction (PR #5746 fork variant). Default-true at the backend;
// the UI exposes no toggle. Operators who pass `--unzipEnabled=false`
// flip this flag, and every Extract trigger surface checks it before
// rendering so a disabled instance shows zero broken affordances.
const unzipEnabled: boolean = window.FileBrowser.UnzipEnabled ?? true;

export {
  name,
  disableExternal,
  disableUsedPercentage,
  baseURL,
  logoURL,
  recaptcha,
  recaptchaKey,
  signup,
  version,
  noAuth,
  authMethod,
  logoutPage,
  loginPage,
  theme,
  enableThumbs,
  resizePreview,
  enableExec,
  tusSettings,
  origin,
  tusEndpoint,
  hideLoginButton,
  unzipEnabled,
};
