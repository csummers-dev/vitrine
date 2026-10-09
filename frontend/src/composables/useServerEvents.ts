/**
 * Subscribe a component to one kind of server-pushed event for as long as the
 * component (or effect scope) lives. The shared stream opens on the first
 * subscriber and closes after the last one unmounts.
 *
 *   useServerEvents("files.changed", ({ dir }) => {
 *     if (dir === currentDir.value) refresh();
 *   });
 */
import { getCurrentScope, onScopeDispose } from "vue";
import {
  eventStream,
  type EventStream,
  type ServerEventHandler,
  type ServerEventType,
} from "@/api/stream";

export function useServerEvents<K extends ServerEventType>(
  type: K,
  handler: ServerEventHandler<K>,
  stream: EventStream = eventStream()
): () => void {
  const off = stream.on(type, handler);
  if (getCurrentScope()) onScopeDispose(off);
  return off;
}
