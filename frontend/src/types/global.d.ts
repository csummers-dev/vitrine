export {};

/** Settings the server injects into index.html as `window.FileBrowser`
 *  (http/static.go). Optional fields may be missing on older bootstraps. */
interface VitrineGlobals {
  AuthMethod: string;
  BaseURL: string;
  CSS: boolean;
  Color: string;
  DisableExternal: boolean;
  DisableUsedPercentage: boolean;
  EnableExec: boolean;
  EnablePdfThumbnails?: boolean;
  EnableThumbs: boolean;
  EnableVideoThumbnails?: boolean;
  HideLoginButton: boolean;
  LoginPage: boolean;
  LogoutPage: string;
  Name: string;
  NoAuth: boolean;
  ReCaptcha: boolean;
  ReCaptchaHost?: string;
  ReCaptchaKey?: string;
  ResizePreview: boolean;
  Signup: boolean;
  StaticURL: string;
  Theme: UserTheme;
  TranscodeEnabled?: boolean;
  TusSettings: TusSettings;
  UnzipEnabled?: boolean;
  Version: string;
}

/** The subset of Google reCAPTCHA v2 the login page uses. */
interface ReCaptchaApi {
  ready: (cb: () => void) => void;
  render: (container: string, params: { sitekey: string }) => number;
  getResponse: (widgetId?: number) => string;
}

declare global {
  interface Window {
    FileBrowser: VitrineGlobals;
    grecaptcha: ReCaptchaApi;
  }

  interface HTMLElement {
    clickOutsideEvent?: (event: Event) => void;
  }
}
