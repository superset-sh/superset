import { describe, expect, it } from "bun:test";
import { composeRepoRunCommands } from "./composeRepoRunCommands";

describe("a project over one source folder", () => {
	it("runs what a single-repo workspace has always run", () => {
		expect(
			composeRepoRunCommands([
				{ path: "/w/town", commands: ["bun dev"], isPrimary: true },
			]),
		).toEqual({ commands: ["bun dev"] });
	});

	it("keeps a configured cwd for the terminal to apply", () => {
		expect(
			composeRepoRunCommands([
				{
					path: "/w/town",
					commands: ["bun dev"],
					cwd: "apps/web",
					isPrimary: true,
				},
			]),
		).toEqual({ commands: ["bun dev"], cwd: "apps/web" });
	});
});

describe("a project over several source folders", () => {
	it("starts every folder that defines one, together", () => {
		expect(
			composeRepoRunCommands([
				{ path: "/w/town", commands: ["bun dev"], isPrimary: true },
				{
					path: "/w/roster",
					commands: ["bun install", "bun start"],
					isPrimary: false,
				},
			]),
		).toEqual({
			commands: [
				"cd '/w/town' && bun dev & cd '/w/roster' && bun install && bun start & wait",
			],
		});
	});

	it("enters a folder's configured cwd under its checkout", () => {
		expect(
			composeRepoRunCommands([
				{ path: "/w/town", commands: ["bun dev"], isPrimary: true },
				{
					path: "/w/roster",
					commands: ["bun start"],
					cwd: "server",
					isPrimary: false,
				},
			]),
		).toEqual({
			commands: [
				"cd '/w/town' && bun dev & cd '/w/roster' && cd 'server' && bun start & wait",
			],
		});
	});

	it("runs a secondary folder from its own checkout when it is the only one", () => {
		expect(
			composeRepoRunCommands([
				{ path: "/w/town", commands: [], isPrimary: true },
				{ path: "/w/roster", commands: ["bun start"], isPrimary: false },
			]),
		).toEqual({ commands: ["cd '/w/roster' && bun start"] });
	});

	it("is nothing when no folder defines one", () => {
		expect(
			composeRepoRunCommands([
				{ path: "/w/town", commands: [], isPrimary: true },
				{ path: "/w/roster", commands: [], isPrimary: false },
			]),
		).toBeNull();
	});

	it("quotes a path that would otherwise break the shell", () => {
		const composed = composeRepoRunCommands([
			{ path: "/w/it's town", commands: ["bun dev"], isPrimary: false },
		]);

		expect(composed?.commands[0]).toBe("cd '/w/it'\\''s town' && bun dev");
	});
});
