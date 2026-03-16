import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * These tests verify the Conversation component's scroll configuration.
 *
 * The scroll behavior is controlled by the `use-stick-to-bottom` library's
 * `resize` prop. Using "instant" for resize causes a race condition:
 * when content changes while the user is scrolled up, the library's
 * ResizeObserver calls scrollToBottom() and the instant behavior commits
 * before isAtBottom is properly checked, causing scroll position jumps.
 *
 * Since we can't render React components without react-dom in this package,
 * we verify the configuration via source code assertions.
 */
describe("Conversation scroll configuration", () => {
	const source = readFileSync(resolve(__dirname, "conversation.tsx"), "utf-8");

	it("does NOT use resize='instant' (causes scroll jumps during streaming)", () => {
		// resize="instant" makes the scroll library instantly jump to the
		// bottom on every content resize. During streaming, this races with
		// user scroll events and causes the viewport to jump around.
		expect(source).not.toMatch(/resize\s*=\s*["']instant["']/);
	});

	it("uses initial='instant' for page load", () => {
		// Initial scroll to bottom should still be instant — when the
		// conversation first loads, we want immediate positioning.
		expect(source).toMatch(/initial\s*=\s*["']instant["']/);
	});

	it("defines a RESIZE_ANIMATION spring config", () => {
		// A spring animation config should be defined and used for resize.
		// This gives the scroll library time to properly evaluate isAtBottom
		// before committing to a scroll, reducing race conditions.
		expect(source).toContain("RESIZE_ANIMATION");
		expect(source).toMatch(/damping:\s*[\d.]+/);
		expect(source).toMatch(/stiffness:\s*[\d.]+/);
		expect(source).toMatch(/mass:\s*[\d.]+/);
	});

	it("passes the spring config as the resize prop", () => {
		expect(source).toMatch(/resize\s*=\s*\{?\s*RESIZE_ANIMATION\s*\}?/);
	});
});
