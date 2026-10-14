import {
  inject,
  onBeforeUnmount,
  provide,
  ref,
  type InjectionKey,
  type Ref,
} from "vue";

/**
 * A labelled row (SettingsRow) shares its label and description ids with
 * the control inside it, so a switch, select or field that prints no label
 * of its own is still named and described, and clicking the row's label
 * reaches the control.
 */
export interface FieldContext {
  labelId: string;
  descriptionId: string | null;
  /** Id of the control in the row, registered by the control. */
  controlId: Ref<string | undefined>;
}

const KEY: InjectionKey<FieldContext> = Symbol("field-context");

export function provideFieldContext(
  ctx: Omit<FieldContext, "controlId">
): FieldContext {
  const full: FieldContext = { ...ctx, controlId: ref(undefined) };
  provide(KEY, full);
  return full;
}

/** For a control: the surrounding row's context, registering its id. */
export function useFieldContext(controlId: () => string): FieldContext | null {
  const ctx = inject(KEY, null);
  if (ctx) {
    ctx.controlId.value = controlId();
    onBeforeUnmount(() => {
      if (ctx.controlId.value === controlId()) ctx.controlId.value = undefined;
    });
  }
  return ctx;
}
