import { describe, expect, test } from "bun:test";
import { createMcpServer } from "./mcp-server.js";

/**
 * Reproduction test for GitHub issue #1801:
 * "Feature: MCP server for built-in browser automation"
 *
 * The desktop-mcp server exposes tools for controlling the Superset app UI
 * (take_screenshot, click, navigate, etc.), but has no tools for interacting
 * with the *webview* content inside the built-in BrowserPane. Agents cannot:
 *   - Navigate the webview to a URL
 *   - Take a screenshot of webview content
 *   - Read the DOM or text of a page loaded in the webview
 *   - Click elements on a web page inside the webview
 *   - Fill form fields inside the webview
 *   - Read console messages produced by the web page
 *   - Execute JavaScript in the webview's page context
 *
 * These tests fail because none of the required browser_* tools are registered.
 */

describe("desktop-mcp browser automation tools (issue #1801)", () => {
	// Access internal tool registry without triggering a CDP connection.
	// createMcpServer() registers tools eagerly; the CDP connection is lazy
	// (only established on the first actual tool call).
	const server = createMcpServer();
	const registeredTools = (
		server as unknown as { _registeredTools: Record<string, unknown> }
	)._registeredTools;

	const EXPECTED_BROWSER_TOOLS = [
		"browser_navigate",
		"browser_screenshot",
		"browser_read_page",
		"browser_click",
		"browser_fill",
		"browser_console",
		"browser_evaluate",
	] as const;

	test.each(
		EXPECTED_BROWSER_TOOLS,
	)('tool "%s" is registered for webview interaction', (toolName) => {
		expect(registeredTools).toHaveProperty(toolName);
	});

	test("no browser_* tools are registered (documents the current gap)", () => {
		const browserTools = Object.keys(registeredTools).filter((name) =>
			name.startsWith("browser_"),
		);
		// This assertion documents the current state: zero browser tools exist.
		// When issue #1801 is implemented, this count should equal
		// EXPECTED_BROWSER_TOOLS.length and the per-tool tests above should pass.
		expect(browserTools).toHaveLength(0);
	});
});
