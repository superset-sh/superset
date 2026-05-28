import { describe, expect, it } from "bun:test";
import { isSafeExternalUrl } from "./scheme";

/**
 * Reproduces issue #4974 — OSC 8 hyperlinks in the terminal status line that
 * use a custom URL scheme (e.g. `obsidian://`) are not clickable in Superset,
 * even when URL Links is set to "Open in default browser".
 *
 * Two layers conspire to block the click:
 *   1. The OSC 8 link handler in `terminal-link-manager.ts` is registered with
 *      `allowNonHttpProtocols: false`, so xterm refuses to mark non-http(s)
 *      OSC 8 hyperlinks as clickable.
 *   2. Even if the click reached the renderer, `isSafeExternalUrl` rejects any
 *      scheme outside the strict http/https/mailto allowlist before the URL
 *      can reach `shell.openExternal`.
 *
 * The user's expectation (matching Ghostty's behavior) is that the URL is
 * routed to the OS default handler — which would dispatch `obsidian://` to
 * the Obsidian app. The assertion below currently fails, demonstrating the
 * bug. The existing `safe-url.test.ts` documents the inverse (intentional)
 * behavior; resolving #4974 will require reconciling the two.
 */
describe("OSC 8 hyperlink with custom URL scheme (issue #4974)", () => {
	it("allows obsidian:// so the OS default handler can route it", () => {
		expect(isSafeExternalUrl("obsidian://vault/note?file=test")).toBe(true);
	});
});
