import { describe, expect, it, mock } from "bun:test";

const readFileSyncMock = mock(() => {
	throw new Error("EACCES");
});

const buildSlashCommandRegistryMock = mock(() => [
	{
		name: "broken",
		aliases: [],
		description: "Broken command",
		argumentHint: "",
		kind: "custom" as const,
		source: "project" as const,
		filePath: "/tmp/missing.md",
	},
]);

mock.module("node:fs", () => ({
	readFileSync: readFileSyncMock,
}));

mock.module("./registry", () => ({
	buildSlashCommandRegistry: buildSlashCommandRegistryMock,
}));

const { resolveSlashCommand } = await import("./resolver");

describe("resolveSlashCommand template read hardening", () => {
	it("does not throw when a command template file cannot be read", () => {
		const warn = mock(() => {});
		const originalWarn = console.warn;
		console.warn = warn as unknown as typeof console.warn;

		try {
			const result = resolveSlashCommand("/tmp", "/broken");
			expect(result.handled).toBe(true);
			expect(result.commandName).toBe("broken");
			expect(result.prompt).toBe("");
		} finally {
			console.warn = originalWarn;
		}

		expect(readFileSyncMock).toHaveBeenCalled();
		expect(warn).toHaveBeenCalled();
	});
});
