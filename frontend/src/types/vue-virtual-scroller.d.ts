/**
 * Minimal type shim for vue-virtual-scroller (v1.3 S6-1).
 *
 * The 2.0.0-beta line (the Vue 3-compatible release) ships no bundled
 * `.d.ts`. We only use `RecycleScroller` (fixed-size list virtualization
 * for the list view), so declare the handful of exports we touch as
 * permissive component types — enough for vue-tsc to resolve the import
 * and the `scrollToItem` instance method without `any`-casting at call
 * sites.
 */
declare module "vue-virtual-scroller" {
  import type { DefineComponent } from "vue";
  export const RecycleScroller: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export const DynamicScroller: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
  export const DynamicScrollerItem: DefineComponent<
    Record<string, unknown>,
    Record<string, unknown>,
    unknown
  >;
}

declare module "vue-virtual-scroller/dist/vue-virtual-scroller.css";
