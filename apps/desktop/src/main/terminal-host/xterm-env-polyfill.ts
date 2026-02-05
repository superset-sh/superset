/**
 * Polyfill for @xterm/headless in Bun.
 *
 * @xterm/headless 6.x detects Node via `navigator.userAgent.startsWith("Node.js/")`.
 * Bun sets `navigator.userAgent` to `"Bun/..."`, so `isNode` is false and the bundle
 * falls through to `"requestIdleCallback" in window`, which throws because `window`
 * is undefined in server runtimes.
 *
 * Setting `globalThis.window = globalThis` makes the `in` check succeed without error.
 * `requestIdleCallback` doesn't exist on `globalThis` in Bun/Node, so the correct
 * fallback (PriorityTaskQueue) is used anyway.
 *
 * This file MUST be imported before any @xterm/headless import.
 */
if (typeof window === "undefined") {
	(globalThis as Record<string, unknown>).window = globalThis;
}
