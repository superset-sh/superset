import { describe, expect, it } from "bun:test";
import {
	findSlashCommandByNameOrAlias,
	matchesSlashCommandIdentity,
} from "./slash-command-matching";

describe("matchesSlashCommandIdentity", () => {
	it("matches canonical names case-insensitively", () => {
		expect(
			matchesSlashCommandIdentity({ name: "Review", aliases: [] }, "review"),
		).toBe(true);
	});

	it("matches aliases case-insensitively", () => {
		expect(
			matchesSlashCommandIdentity({ name: "new", aliases: ["clear"] }, "CLEAR"),
		).toBe(true);
	});
});

describe("findSlashCommandByNameOrAlias", () => {
	it("returns the matching command", () => {
		const command = findSlashCommandByNameOrAlias(
			[
				{ name: "new", aliases: ["clear"] },
				{ name: "model", aliases: [] },
			],
			"clear",
		);

		expect(command?.name).toBe("new");
	});

	it("returns null when not found", () => {
		const command = findSlashCommandByNameOrAlias(
			[{ name: "plan", aliases: [] }],
			"missing",
		);
		expect(command).toBeNull();
	});
});
