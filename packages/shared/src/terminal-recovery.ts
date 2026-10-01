import { z } from "zod";

export const MAX_TERMINAL_RECOVERY_BYTES = 5 * 1024 * 1024;
export const terminalRecoverySnapshotSchema = z.object({
	version: z.literal(1),
	ansi: z
		.string()
		.max(MAX_TERMINAL_RECOVERY_BYTES)
		.refine(
			(value) =>
				new TextEncoder().encode(value).byteLength <=
				MAX_TERMINAL_RECOVERY_BYTES,
		),
	cols: z.number().int().min(1).max(1000),
	rows: z.number().int().min(1).max(1000),
	cwd: z.string().max(4096).optional(),
});
export type TerminalRecoverySnapshot = z.infer<
	typeof terminalRecoverySnapshotSchema
>;

export function captureTerminalRecoverySnapshot(
	terminal: { cols: number; rows: number; options: { scrollback?: number } },
	serialize: (options: { scrollback: number; excludeModes: boolean }) => string,
): TerminalRecoverySnapshot {
	for (
		let scrollback = terminal.options.scrollback ?? 5000;
		scrollback >= 0;
		scrollback = scrollback > 0 ? Math.floor(scrollback / 2) : -1
	) {
		const ansi = serialize({ scrollback, excludeModes: true });
		const result = terminalRecoverySnapshotSchema.safeParse({
			version: 1,
			ansi,
			cols: terminal.cols,
			rows: terminal.rows,
		});
		if (result.success) return result.data;
	}
	throw new Error("Terminal screen exceeds the recovery history limit");
}

export function parseTerminalRecoverySnapshot(
	descriptor: Record<string, string>,
): TerminalRecoverySnapshot | undefined {
	try {
		const value = descriptor.snapshot
			? JSON.parse(descriptor.snapshot)
			: descriptor.scrollback
				? { version: 1, ansi: descriptor.scrollback, cols: 80, rows: 24 }
				: undefined;
		const parsed = terminalRecoverySnapshotSchema.safeParse(value);
		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}
