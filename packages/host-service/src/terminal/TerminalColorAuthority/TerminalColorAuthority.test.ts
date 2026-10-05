import { describe, expect, test } from "bun:test";
import type { TerminalColors } from "@superset/shared/terminal-colors";
import { TerminalColorAuthority } from "./TerminalColorAuthority";

const dark = {
	foreground: "#ffffff",
	background: "#000000",
	cursor: "#ffffff",
};
const light = {
	foreground: "#000000",
	background: "#ffffff",
	cursor: "#000000",
};

function harness() {
	const applied: Array<{ colors: TerminalColors; resetOverrides: boolean }> =
		[];
	const authority = new TerminalColorAuthority<object>(
		(colors, resetOverrides) => applied.push({ colors, resetOverrides }),
	);
	return { authority, applied };
}

describe("terminal color authority", () => {
	test("an older observer without colors cannot block a capable viewer", () => {
		const { authority, applied } = harness();
		const olderObserver = {};
		const desktop = {};
		authority.update(desktop, light);
		authority.remove(olderObserver);
		expect(applied).toEqual([{ colors: light, resetOverrides: false }]);
	});

	test("promotes the next capable viewer's latest colors on owner detach", () => {
		const { authority, applied } = harness();
		const first = {},
			second = {},
			third = {};
		authority.update(first, dark);
		authority.update(second, dark);
		authority.update(third, dark);
		authority.update(second, light, true);
		expect(applied).toHaveLength(1);
		authority.remove(first);
		expect(applied.at(-1)).toEqual({ colors: light, resetOverrides: true });
		authority.remove(first);
		expect(applied).toHaveLength(2);
		authority.remove(second);
		expect(applied.at(-1)).toEqual({ colors: dark, resetOverrides: false });
		authority.remove(third);
		expect(applied).toHaveLength(3);
	});

	test("appearance resets reach the owner even when RGB values are unchanged", () => {
		const { authority, applied } = harness();
		const owner = {};
		authority.update(owner, dark);
		authority.update(owner, { ...dark }, true);
		authority.update(owner, dark);
		expect(applied.map((entry) => entry.resetOverrides)).toEqual([
			false,
			true,
			false,
		]);
	});

	test("a queued appearance reset survives synchronization until promotion", () => {
		const { authority, applied } = harness();
		const first = {},
			second = {};
		authority.update(first, dark);
		authority.update(second, light, true);
		authority.update(second, light);
		authority.remove(first);
		expect(applied.at(-1)).toEqual({ colors: light, resetOverrides: true });
		authority.update(second, light);
		expect(applied.at(-1)).toEqual({ colors: light, resetOverrides: false });
	});
});
