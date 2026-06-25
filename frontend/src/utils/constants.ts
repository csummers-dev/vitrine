// The app's fixed wordmark. Lowercase is intentional — it's a brand mark,
// not a sentence. Used as the trailing segment of the document <title>.
const brand = "filebrowser pretty";
// `name` is the instance/branding name (`settings.Branding.Name`), falling
// back to the wordmark when empty (fresh install before quickSetup, or admin
// cleared the field). Drives the sidebar wordmark and the root listing title.
const name: string = window.FileBrowser.Name || brand;
const disableExternal: boolean = window.FileBrowser.DisableExternal;
const disableUsedPercentage: boolean = window.FileBrowser.DisableUsedPercentage;
const baseURL: string = window.FileBrowser.BaseURL;
const staticURL: string = window.FileBrowser.StaticURL;
const recaptcha: string = window.FileBrowser.ReCaptcha;
const recaptchaKey: string = window.FileBrowser.ReCaptchaKey;
const signup: boolean = window.FileBrowser.Signup;
const version: string = window.FileBrowser.Version;
// PNG brand mark used by the sidebar/drawer top-left glyph (logo.svg is the
// login-screen wordmark). Served from public/img/logo.png.
const logoPngURL = `${staticURL}/img/logo.png`;
const noAuth: boolean = window.FileBrowser.NoAuth;
const authMethod = window.FileBrowser.AuthMethod;
const logoutPage: string = window.FileBrowser.LogoutPage;
const loginPage: boolean = window.FileBrowser.LoginPage;
const theme: UserTheme = window.FileBrowser.Theme;
const enableThumbs: boolean = window.FileBrowser.EnableThumbs;
// S6-2: video poster-frame thumbnails. True only when thumbnails are on
// AND the server detected ffmpeg — so rows request a video thumb only
// when one can actually be served (else they keep the generic icon).
// `?? false` keeps older bootstraps (no field) safely off.
const enableVideoThumbs: boolean =
  window.FileBrowser.EnableVideoThumbnails ?? false;
// Cover-art thumbnails. Audio (album art) + EPUB (OPF cover) need no server
// binary, so they ride `enableThumbs` directly. PDF needs poppler's pdftoppm
// on the server, so it gets its own capability flag (false on older
// bootstraps / installs without poppler → PDF rows keep the generic icon).
const enablePdfThumbs: boolean =
  window.FileBrowser.EnablePdfThumbnails ?? false;
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
// #3: on-demand video transcoding. True only when the server has ffmpeg.
// The player attempts the transcode fallback (on a native playback error)
// only when this is set; otherwise it goes straight to the download card.
const transcodeEnabled: boolean = window.FileBrowser.TranscodeEnabled ?? false;

// Project source repository — surfaced from the version label in the sidebar
// header and the login footer.
const repoUrl = "https://github.com/csummers-dev/filebrowser-pretty";

export {
  name,
  brand,
  disableExternal,
  disableUsedPercentage,
  baseURL,
  logoPngURL,
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
  enableVideoThumbs,
  enablePdfThumbs,
  resizePreview,
  enableExec,
  tusSettings,
  origin,
  tusEndpoint,
  hideLoginButton,
  unzipEnabled,
  transcodeEnabled,
  repoUrl,
};
