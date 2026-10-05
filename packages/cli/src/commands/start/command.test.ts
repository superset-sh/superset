import { describe, expect, mock, test } from "bun:test";
import type { CliContext } from "../../lib/command";
import startCommand from "./command";

describe("start auto-update options", () => {
	for (const daemon of [undefined, false]) {
		test(`rejects auto-update with daemon=${daemon} before querying organizations`, async () => {
			const query = mock(async () => []);
			await expect(
				startCommand.run({
					ctx: {
						api: { user: { myOrganizations: { query } } },
					} as unknown as CliContext,
					args: {},
					options: {
						autoUpdate: true,
						daemon,
						port: undefined,
						org: undefined,
					},
					signal: new AbortController().signal,
				}),
			).rejects.toThrow("--auto-update requires --daemon");
			expect(query).not.toHaveBeenCalled();
		});
	}

	for (const options of [
		{ autoUpdate: true, daemon: true },
		{ autoUpdate: false, daemon: false },
		{ autoUpdate: undefined, daemon: undefined },
	]) {
		test(`allows ${JSON.stringify(options)} through to organization lookup`, async () => {
			const lookupError = new Error("Organization lookup reached");
			const query = mock(async () => {
				throw lookupError;
			});
			await expect(
				startCommand.run({
					ctx: {
						api: { user: { myOrganizations: { query } } },
					} as unknown as CliContext,
					args: {},
					options: { ...options, port: undefined, org: undefined },
					signal: new AbortController().signal,
				}),
			).rejects.toBe(lookupError);
			expect(query).toHaveBeenCalledTimes(1);
		});
	}
});
