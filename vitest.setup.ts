import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.scrollTo; TanStack Router's scroll restoration
// calls it on every navigation in tests. Stub it to silence the warning.
if (typeof window !== "undefined") {
  window.scrollTo = (() => {}) as typeof window.scrollTo;
}
