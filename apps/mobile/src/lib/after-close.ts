// Pure: holds a message until a sheet has finished closing (toasts render under native modals).

export type AfterClose<T> = {
  /** The sheet opened: messages wait again. */
  opened: () => void;
  /** The sheet finished closing: sends what's waiting, and sends later messages right away. */
  closed: () => void;
  /** Sends now if the sheet is already closed, otherwise waits for `closed`. */
  send: (message: T) => void;
};

export function createAfterClose<T>(deliver: (message: T) => void, startsClosed = true): AfterClose<T> {
  let isClosed = startsClosed;
  let waiting: T[] = [];
  return {
    opened() {
      isClosed = false;
    },
    closed() {
      isClosed = true;
      const ready = waiting;
      waiting = [];
      // Only the latest matters: a toast replaces the one before it.
      if (ready.length > 0) deliver(ready[ready.length - 1]);
    },
    send(message) {
      if (isClosed) deliver(message);
      else waiting.push(message);
    },
  };
}
