import { computed, useId } from "vue";

/** Ids that tie a field to its label, hint and error (aria-describedby). */
export function useFieldIds(
  id: () => string | undefined,
  hint: () => string | undefined,
  error: () => string | undefined
) {
  const auto = useId();
  const inputId = computed(() => id() ?? `f-${auto}`);
  const hintId = computed(() => `${inputId.value}-hint`);
  const errorId = computed(() => `${inputId.value}-error`);
  const describedBy = computed(
    () =>
      [error() ? errorId.value : null, hint() ? hintId.value : null]
        .filter(Boolean)
        .join(" ") || undefined
  );
  return { inputId, hintId, errorId, describedBy };
}
