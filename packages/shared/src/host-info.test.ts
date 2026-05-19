import { describe, expect, it, mock } from "bun:test";
import * as realOs from "node:os";

interface CapturedCall {
	file: string;
	args: readonly string[] | undefined;
	options: Record<string, unknown> | undefined;
}

const execFileSyncCalls: CapturedCall[] = [];

mock.module("node:child_process", () => ({
	execFileSync: (
		file: string,
		args?: readonly string[],
		options?: Record<string, unknown>,
	) => {
		execFileSyncCalls.push({ file, args, options });
		const err = new Error("Command timed out: ioreg") as Error & {
			code?: string;
		};
		err.code = "ETIMEDOUT";
		throw err;
	},
}));

mock.module("node:os", () => ({
	...realOs,
	platform: () => "darwin",
	default: {
		...realOs,
		platform: () => "darwin",
	},
}));

const { getMachineId } = await import("./host-info");

describe("getMachineId on darwin when ioreg subprocess hangs", () => {
	it("bounds the ioreg subprocess with a numeric timeout option", () => {
		// Reproduces #4396: today execFileSync is invoked with only
		// `{ encoding: "utf8" }`. If `ioreg` hangs (e.g. an EDR/sandboxing
		// tool wedges subprocess spawn) the synchronous call blocks the
		// main event loop forever and the renderer's authenticated tree —
		// which is gated on the getMachineId tRPC query — never resolves,
		// producing a white screen. The fix is to pass a finite numeric
		// `timeout` so a hung subprocess degrades into the fallback path
		// rather than freezing main.
		const id = getMachineId();

		expect(execFileSyncCalls).toHaveLength(1);
		const options = execFileSyncCalls[0]?.options ?? {};
		expect(typeof options.timeout).toBe("number");
		expect(options.timeout as number).toBeGreaterThan(0);

		expect(id).toBe(
			`${realOs.hostname()}-${realOs.homedir()}-superset-fallback`,
		);
	});
});
