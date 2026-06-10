export {};

declare global {
  interface Window {
    FileBrowser: any;
    grecaptcha: any;
  }

  interface HTMLElement {
    clickOutsideEvent?: (event: Event) => void;
  }
}
