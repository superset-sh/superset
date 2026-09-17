import { describe, expect, test } from "bun:test";
import { findCommandById } from "./findCommandById";
import type { Command, CommandContext, CommandSection } from "./types";

const context = { workspace: null } as CommandContext;

function command(id: string, overrides: Partial<Command> = {}): Command {
	return {
		id,
		title: { id, message: id },
		section: "actions",
		...overrides,
	};
}

function section(commands: Command[]): CommandSection {
	return {
		id: "actions",
		label: { id: "actions", message: "Actions" },
		commands,
	};
}

describe("findCommandById", () => {
	test("finds a top-level command", () => {
		const usage = command("usage.open");

		expect(findCommandById([section([usage])], "usage.open", context)).toBe(
			usage,
		);
	});

	test("finds a command nested under static children", () => {
		const tab = command("settings.appearance");
		const settings = command("nav.settings", { children: [tab] });

		expect(
			findCommandById([section([settings])], "settings.appearance", context),
		).toBe(tab);
	});

	test("finds a command nested under children built from context", () => {
		const tab = command("settings.appearance");
		const settings = command("nav.settings", { children: () => [tab] });

		expect(
			findCommandById([section([settings])], "settings.appearance", context),
		).toBe(tab);
	});

	test("skips a nested command whose `when` rejects the context", () => {
		const tab = command("settings.appearance", { when: () => false });
		const settings = command("nav.settings", { children: [tab] });

		expect(
			findCommandById([section([settings])], "settings.appearance", context),
		).toBeNull();
	});

	test("returns null for an unknown id", () => {
		expect(
			findCommandById([section([command("usage.open")])], "gone", context),
		).toBeNull();
	});
});
