/**
 * Map any error (a `StatusError` with `.status`, or a plain Error) to a
 * named, human-readable error state (v1.3 S6-5).
 *
 * Centralizes the "what went wrong" copy so every surface that fetches
 * data can render a consistent named overlay — "Server unreachable",
 * "Permission denied", "Not found" — instead of a silent empty state
 * or a bare toast. Pairs with `EmptyState.vue` (icon / title / hint /
 * tone) for the visual.
 */
import { StatusError } from "@/api/utils";

export interface ErrorDescriptor {
  /** Lucide icon name for the EmptyState chip. */
  icon: string;
  /** Headline. */
  title: string;
  /** One-line explanation under the title. */
  hint: string;
  /** EmptyState tone for the icon chip. */
  tone: "danger" | "warn" | "info";
  /** Whether a "Try again" affordance makes sense (transient failures
   *  — connection drops, server errors — vs. terminal ones like a 404
   *  or 403 that retrying won't fix). */
  retryable: boolean;
}

/** Pull the numeric HTTP status off an error, if it carries one. */
const statusOf = (err: unknown): number | undefined => {
  if (err instanceof StatusError) return err.status;
  return undefined;
};

export function describeError(err: unknown): ErrorDescriptor {
  const status = statusOf(err);

  // Network / no-connection (StatusError uses status 0 for this).
  if (status === 0) {
    return {
      icon: "cloud-off",
      title: "Server unreachable",
      hint: "Couldn't reach the server. Check your connection and try again.",
      tone: "warn",
      retryable: true,
    };
  }

  if (status === 401) {
    return {
      icon: "log-in",
      title: "Session expired",
      hint: "Your session ended. Sign in again to continue.",
      tone: "warn",
      retryable: false,
    };
  }

  if (status === 403) {
    return {
      icon: "lock",
      title: "Permission denied",
      hint: "You don't have access to this.",
      tone: "danger",
      retryable: false,
    };
  }

  if (status === 404) {
    return {
      icon: "map-pin-off",
      title: "Not found",
      hint: "This may have been moved, renamed, or deleted.",
      tone: "info",
      retryable: false,
    };
  }

  if (status !== undefined && status >= 500) {
    return {
      icon: "circle-alert",
      title: "Server error",
      hint: "Something went wrong on the server. Try again in a moment.",
      tone: "danger",
      retryable: true,
    };
  }

  // Unknown / generic — surface the message when it's useful.
  const message =
    err instanceof Error && err.message
      ? err.message
      : "Something went wrong while loading.";
  return {
    icon: "circle-alert",
    title: "Couldn't load",
    hint: message,
    tone: "danger",
    retryable: true,
  };
}
