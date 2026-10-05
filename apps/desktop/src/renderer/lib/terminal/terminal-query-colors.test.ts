import { expect, test } from "bun:test";
import { terminalQueryColors } from "./terminal-query-colors";

test("configured colors include custom background and partial ANSI overrides", () => {
	const colors = terminalQueryColors({
		foreground: "#eae8e6",
		background: "#151110",
		cursor: "#abc",
		red: "#123456",
	});
	expect(colors.foreground).toBe("#eae8e6");
	expect(colors.background).toBe("#151110");
	expect(colors.cursor).toBe("#aabbcc");
	expect(colors.ansi?.[1]).toBe("#123456");
	expect(colors.ansi?.[0]).toBe("#2e3436");
});

test("matches xterm RGB and cursor alpha semantics for normalized theme hex", () => {
	const colors = terminalQueryColors({
		foreground: "#12345680",
		background: "#00000080",
		cursor: "#ffffff80",
	});
	expect(colors.foreground).toBe("#123456");
	expect(colors.background).toBe("#000000");
	expect(colors.cursor).toBe("#808080");
});

test("missing or invalid theme slots use xterm defaults", () => {
	const colors = terminalQueryColors({
		background: "invalid",
		foreground: "#123456",
	});
	expect(colors.background).toBe("#000000");
	expect(colors.cursor).toBe("#ffffff");
});
