interface PopupProps {
  prompt: string;
  // The prompt channel is deliberately dynamic: each prompt component calls
  // confirm with its own arguments (an event, a chosen format, conflict
  // results…) and reads its own props. These two are the codebase's only
  // explicit `any`; type a prompt's payload at its call site instead.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  confirm?: any;
  action?: PopupAction;
  saveAction?: () => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  props?: any;
  close?: (() => Promise<string>) | null;
}

type PopupAction = (e: Event) => void;
