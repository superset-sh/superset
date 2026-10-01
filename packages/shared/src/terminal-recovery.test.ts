import { expect, test } from "bun:test";
import {
	captureTerminalRecoverySnapshot,
	MAX_TERMINAL_RECOVERY_BYTES,
	parseTerminalRecoverySnapshot,
	terminalRecoverySnapshotSchema,
} from "./terminal-recovery";

test("limits UTF-8 bytes and reduces complete snapshots without cutting ANSI", () => {
	const requested: number[] = [];
	const result = captureTerminalRecoverySnapshot(
		{ cols: 80, rows: 24, options: { scrollback: 5000 } },
		({ scrollback }) => {
			requested.push(scrollback);
			return scrollback === 5000
				? "界".repeat(2_000_000)
				: "\x1b[31mbounded\x1b[0m";
		},
	);
	expect(requested).toEqual([5000, 2500]);
	expect(result.ansi).toBe("\x1b[31mbounded\x1b[0m");
	expect(
		terminalRecoverySnapshotSchema.safeParse({
			...result,
			ansi: "x".repeat(MAX_TERMINAL_RECOVERY_BYTES + 1),
		}).success,
	).toBe(false);
});

test("fails explicitly if even the visible screen cannot fit", () => {
	expect(() =>
		captureTerminalRecoverySnapshot(
			{ cols: 80, rows: 24, options: { scrollback: 0 } },
			() => "x".repeat(MAX_TERMINAL_RECOVERY_BYTES + 1),
		),
	).toThrow("exceeds");
});

test("decodes archived and legacy history and rejects corrupt archives", () => {
	const snapshot = { version: 1 as const, ansi: "history", cols: 80, rows: 24 };
	expect(
		parseTerminalRecoverySnapshot({ snapshot: JSON.stringify(snapshot) }),
	).toEqual(snapshot);
	expect(parseTerminalRecoverySnapshot({ scrollback: "history" })).toEqual(
		snapshot,
	);
	const invalid: Record<string, string>[] = [
		{},
		{ snapshot: "{" },
		{ snapshot: '{"version":99}' },
		{ scrollback: "x".repeat(MAX_TERMINAL_RECOVERY_BYTES + 1) },
	];
	for (const descriptor of invalid)
		expect(parseTerminalRecoverySnapshot(descriptor)).toBeUndefined();
});
