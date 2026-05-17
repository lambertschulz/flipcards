import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.scrollTo; TanStack Router's scroll restoration
// calls it on every navigation in tests. Stub it to silence the warning.
if (typeof window !== "undefined") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}

// jsdom 25 still ships a partial HTMLDialogElement (no `showModal`, no
// `close`). The card-edit modal used during a Review-Session (issue #6) and
// the discard-confirmation dialog inside the CardEditor both rely on these
// native methods. Polyfill them in the test environment so the components
// can be rendered and exercised end-to-end.
if (typeof HTMLDialogElement !== "undefined") {
  const proto = HTMLDialogElement.prototype as HTMLDialogElement & {
    showModal: () => void;
    show: () => void;
    close: (returnValue?: string) => void;
  };
  if (typeof proto.showModal !== "function") {
    proto.showModal = function showModal(this: HTMLDialogElement) {
      this.setAttribute("open", "");
      // The reflected `open` boolean property updates automatically via the
      // attribute, but we set it explicitly for clarity.
      Object.defineProperty(this, "open", { configurable: true, value: true });
    };
  }
  if (typeof proto.show !== "function") {
    proto.show = function show(this: HTMLDialogElement) {
      this.setAttribute("open", "");
      Object.defineProperty(this, "open", { configurable: true, value: true });
    };
  }
  if (typeof proto.close !== "function") {
    proto.close = function close(this: HTMLDialogElement) {
      this.removeAttribute("open");
      Object.defineProperty(this, "open", { configurable: true, value: false });
      this.dispatchEvent(new Event("close"));
    };
  }
}
