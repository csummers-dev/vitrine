import { computed, useAttrs } from "vue";

/**
 * For a field component with `inheritAttrs: false`: `class` and `style`
 * go on the field's outer box (so a caller's layout class sizes the whole
 * field, label included), everything else (name, type, data-testid,
 * listeners…) on the control itself.
 */
export function useSplitAttrs() {
  const attrs = useAttrs();
  const rootAttrs = computed(() => ({
    class: attrs.class,
    style: attrs.style,
  }));
  const controlAttrs = computed(() => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { class: _c, style: _s, ...rest } = attrs;
    return rest;
  });
  return { rootAttrs, controlAttrs };
}
