import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { TRPCClientError } from "@trpc/client";

const open = mock(async (_input: unknown) => ({ paneIds: ["pane-1"] }));
const resolveFilesTarget = mock(async () => ({
	workspaceId: "ws-1",
	hostId: "host-1",
	client: { files: { open: { mutate: open } } },
}));
mock.module("./utils/resolveFilesTarget", () => ({ resolveFilesTarget }));
const { default: command } = await import("./command");

let tempDir: string;
// After chdir, process.cwd() is the real path (macOS keeps /var under /private).
let cwd: string;
const originalCwd = process.cwd();

beforeEach(() => {
	tempDir = mkdtempSync(join(tmpdir(), "files-open-"));
	process.chdir(tempDir);
	cwd = process.cwd();
	open.mockClear();
	resolveFilesTarget.mockClear();
});

afterEach(() => {
	process.chdir(originalCwd);
	rmSync(tempDir, { recursive: true, force: true });
});

async function invoke(
	paths: string[],
	options: Partial<{
		workspace: string;
		host: string;
		local: boolean;
		line: number;
		newTab: boolean;
	}> = {},
): Promise<{ data: unknown; message: string }> {
	const result = await command.run({
		ctx: {} as never,
		args: { paths } as never,
		options: options as never,
		signal: new AbortController().signal,
	});
	return result as { data: unknown; message: string };
}

describe("files open", () => {
	test("resolves paths against the cwd and splits beside the active pane by default", async () => {
		const absolute = resolve("/abs/b.ts");
		const result = await invoke(["src/a.ts", absolute]);
		expect(open).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paths: [join(cwd, "src/a.ts"), absolute],
			line: undefined,
			target: "current-tab",
		});
		expect(result.data).toEqual({
			workspaceId: "ws-1",
			paths: [join(cwd, "src/a.ts"), absolute],
			paneIds: ["pane-1"],
		});
		expect(resolveFilesTarget).toHaveBeenLastCalledWith(
			{},
			{ workspace: undefined, host: undefined, local: undefined },
			cwd,
		);
	});

	test("forwards --line, --new-tab, and the workspace flags", async () => {
		await invoke(["a.ts"], {
			workspace: "ws-9",
			host: "host-9",
			local: true,
			line: 42,
			newTab: true,
		});
		expect(open).toHaveBeenLastCalledWith({
			workspaceId: "ws-1",
			paths: [join(cwd, "a.ts")],
			line: 42,
			target: "new-tab",
		});
		expect(resolveFilesTarget).toHaveBeenLastCalledWith(
			{},
			{ workspace: "ws-9", host: "host-9", local: true },
			cwd,
		);
	});

	test("refuses --line with several files before resolving a workspace", async () => {
		await expect(invoke(["a.ts", "b.ts"], { line: 3 })).rejects.toThrow(
			"--line applies to a single file",
		);
		expect(resolveFilesTarget).not.toHaveBeenCalled();
		expect(open).not.toHaveBeenCalled();
	});

	test("explains a host whose Superset predates files.open", async () => {
		open.mockRejectedValueOnce(
			new TRPCClientError('No "mutation"-procedure on path "files.open"', {
				result: {
					error: {
						message: 'No "mutation"-procedure on path "files.open"',
						code: -32004,
						data: { code: "NOT_FOUND", httpStatus: 404, path: "files.open" },
					},
				},
			}),
		);
		await expect(invoke(["a.ts"])).rejects.toThrow(
			"runs a Superset without `files open`",
		);
	});

	test("passes other host errors through unchanged", async () => {
		const hostError = new TRPCClientError("No such file: /x/a.ts", {
			result: {
				error: {
					message: "No such file: /x/a.ts",
					code: -32004,
					data: { code: "NOT_FOUND", httpStatus: 404, path: "files.open" },
				},
			},
		});
		open.mockRejectedValueOnce(hostError);
		await expect(invoke(["a.ts"])).rejects.toBe(hostError);
	});

	test("points at --local when the host has no desktop attached", async () => {
		open.mockRejectedValueOnce(
			new TRPCClientError("This host has no panes to drive", {
				result: {
					error: {
						message: "This host has no panes to drive",
						code: -32000,
						data: {
							code: "PRECONDITION_FAILED",
							httpStatus: 412,
							path: "files.open",
						},
					},
				},
			}),
		);
		await expect(invoke(["a.ts"])).rejects.toThrow("no panes to drive");
	});

	test("prints one pane line per opened file", async () => {
		open.mockResolvedValueOnce({ paneIds: ["pane-1", "pane-2"] });
		const result = await invoke(["a.ts", "b.ts"]);
		expect(result.message).toBe(
			"Opened 2 files in workspace ws-1\npane: pane-1\npane: pane-2",
		);
	});
});
