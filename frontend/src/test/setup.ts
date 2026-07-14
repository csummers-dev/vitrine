// Global test setup (runs before each test file, jsdom environment).
//
// The Go server injects `window.FileBrowser` into index.html at runtime;
// `utils/constants.ts` reads it at *import* time. Shim it here so any module
// that transitively imports constants can load under the test runner.
window.FileBrowser = {
  Name: "vitrine",
  DisableExternal: false,
  DisableUsedPercentage: false,
  BaseURL: "/",
  StaticURL: "/static",
  ReCaptcha: "",
  ReCaptchaKey: "",
  Signup: false,
  Version: "test",
  NoAuth: false,
  AuthMethod: "password",
  LoginPage: true,
  Theme: "",
  EnableThumbs: true,
  EnableVideoThumbnails: false,
  EnablePdfThumbnails: false,
  ResizePreview: false,
  EnableExec: false,
  TusSettings: { chunkSize: 0, retryCount: 0 },
  HideLoginButton: false,
};
