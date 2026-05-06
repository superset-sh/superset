import { describe, expect, test } from "bun:test";
import setupCommand from "./command";

const noopCtx = {
	api: {} as never,
	config: { organizationId: "00000000-0000-0000-0000-000000000001" } as never,
	bearer: "test-bearer",
	authSource: "oauth" as const,
};

const baseRunOpts = {
	args: {} as never,
	signal: new AbortController().signal,
	ctx: noopCtx,
};

describe("projects setup command", () => {
	test("exposes a description and the option surface", () => {
		expect(setupCommand.description).toMatch(/set up a v2 project/i);
		const optionKeys = Object.keys(setupCommand.options ?? {});
		// `host`/`local` choose target host, `project` is the cloud project id,
		// and `import`/`clone` are the two setup modes — without these the
		// headless-host scenario in #4146 has no CLI surface at all.
		for (const key of ["host", "local", "project", "import", "clone"]) {
			expect(optionKeys).toContain(key);
		}
		expect(setupCommand.options?.project._.config.isRequired).toBe(true);
	});

	test("rejects passing both --import and --clone", async () => {
		await expect(
			setupCommand.run({
				...baseRunOpts,
				options: {
					host: undefined,
					local: true,
					project: "00000000-0000-0000-0000-000000000010",
					import: "/tmp/repo",
					clone: "/tmp/parent",
					relocate: undefined,
				},
			}),
		).rejects.toThrow(/exactly one of --import or --clone/i);
	});

	test("rejects passing neither --import nor --clone", async () => {
		await expect(
			setupCommand.run({
				...baseRunOpts,
				options: {
					host: undefined,
					local: true,
					project: "00000000-0000-0000-0000-000000000010",
					import: undefined,
					clone: undefined,
					relocate: undefined,
				},
			}),
		).rejects.toThrow(/exactly one of --import or --clone/i);
	});

	test("rejects --relocate without --import", async () => {
		await expect(
			setupCommand.run({
				...baseRunOpts,
				options: {
					host: undefined,
					local: true,
					project: "00000000-0000-0000-0000-000000000010",
					import: undefined,
					clone: "/tmp/parent",
					relocate: true,
				},
			}),
		).rejects.toThrow(/--relocate requires --import/i);
	});

	test("requires a host target", async () => {
		await expect(
			setupCommand.run({
				...baseRunOpts,
				options: {
					host: undefined,
					local: undefined,
					project: "00000000-0000-0000-0000-000000000010",
					import: "/tmp/repo",
					clone: undefined,
					relocate: undefined,
				},
			}),
		).rejects.toThrow(/Target host required/i);
	});

	test("requires an active organization", async () => {
		await expect(
			setupCommand.run({
				...baseRunOpts,
				ctx: {
					...noopCtx,
					config: { organizationId: undefined } as never,
				},
				options: {
					host: undefined,
					local: true,
					project: "00000000-0000-0000-0000-000000000010",
					import: "/tmp/repo",
					clone: undefined,
					relocate: undefined,
				},
			}),
		).rejects.toThrow(/No active organization/i);
	});
});
