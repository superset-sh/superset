import { describe, expect, mock, test } from "bun:test";

type ExecFileSyncOptions = { encoding?: string; timeout?: number };
type ExecFileSyncCall = {
	file: string;
	args: readonly string[];
	options: ExecFileSyncOptions;
};

const execFileSyncCalls: ExecFileSyncCall[] = [];

mock.module("node:child_process", () => ({
	execFileSync: (
		file: string,
		args: readonly string[],
		options: ExecFileSyncOptions,
	) => {
		execFileSyncCalls.push({ file, args, options });
		// Pretend ioreg returned a UUID so the fallback path doesn't fire.
		return '"IOPlatformUUID" = "test-uuid-1234"\n';
	},
}));

mock.module("node:os", () => ({
	platform: () => "darwin",
	hostname: () => "test-host",
	homedir: () => "/home/test",
}));

const { getMachineId } = await import("./host-info");

describe("host-info getMachineId on macOS", () => {
	test("bounds the ioreg subprocess with a timeout so a hung ioreg cannot block the main process indefinitely", () => {
		// Reset module-level cache by calling once and discarding.
		execFileSyncCalls.length = 0;
		getMachineId();

		expect(execFileSyncCalls.length).toBeGreaterThan(0);
		const ioregCall = execFileSyncCalls.find((c) => c.file === "ioreg");
		expect(ioregCall).toBeDefined();

		// Regression guard for superset-sh/superset#4567: without a timeout
		// `execFileSync` blocks the main event loop if ioreg ever hangs (e.g.
		// when a sandbox/security tool intercepts subprocess spawn). The
		// renderer's authenticated tree is gated on the resulting machineId
		// query, so the entire UI freezes and then white-screens.
		expect(ioregCall?.options.timeout).toBeDefined();
		expect(typeof ioregCall?.options.timeout).toBe("number");
		expect(ioregCall?.options.timeout).toBeGreaterThan(0);
		expect(Number.isFinite(ioregCall?.options.timeout ?? 0)).toBe(true);
	});
});
