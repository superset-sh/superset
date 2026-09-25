import { appendFileSync, readFileSync } from "node:fs";

/**
 * One phase of a sandbox boot: `at` is the epoch in milliseconds, written by
 * the boot script (`stamp <phase>`) or by this process once it listens.
 */
export interface BootStamp {
	phase: string;
	at: number;
}

export interface SandboxBootReport {
	/** The current boot's stamps in order, starting at its `boot.start`. */
	stamps: BootStamp[];
	runtime: {
		node: string;
		hostService: string;
	};
	/** The bundle the box is on (`current.bundle-hash`), null before the first boot. */
	bundle: string | null;
	/** Which of the boot runner's ready flags are up right now. */
	ready: Record<string, boolean>;
}

const BOOT_START = "boot.start";
/** `<epoch ms> <phase> [detail]`; the runner's own lines (`setup …`) carry no phase and are skipped below. */
const STAMP_LINE = /^(\d{13}) ([a-z][a-z0-9-]*(?:\.[a-z0-9-]+)+)(?: .*)?$/;

/**
 * The boot log is append-only across wakes, so a boot is the run of lines
 * from the last `boot.start`. A phase is a dotted token; a line's trailing
 * detail and lines the runner's subcommands print are skipped.
 */
export function parseBootStamps(log: string): BootStamp[] {
	let current: BootStamp[] = [];
	for (const line of log.split("\n")) {
		const match = STAMP_LINE.exec(line.trim());
		if (!match?.[1] || !match[2]) continue;
		const stamp = { at: Number(match[1]), phase: match[2] };
		if (stamp.phase === BOOT_START) current = [];
		current.push(stamp);
	}
	return current;
}

function bootLogPath(): string | undefined {
	return process.env.SUPERSET_SANDBOX_BOOT_LOG;
}

/** Appends a phase to the boot log; a host without one (every non-sandbox host) records nothing. */
export function recordBootStamp(phase: string, at = Date.now()): void {
	const path = bootLogPath();
	if (!path) return;
	try {
		appendFileSync(path, `${at} ${phase}\n`);
	} catch (error) {
		console.warn(`[boot-stamps] could not write ${phase}`, error);
	}
}

/** The epoch this process started at, the way the boot script would have stamped it. */
export function processStartedAt(): number {
	return Date.now() - Math.round(process.uptime() * 1000);
}

export function readBootStamps(): BootStamp[] {
	const path = bootLogPath();
	if (!path) return [];
	try {
		return parseBootStamps(readFileSync(path, "utf8"));
	} catch {
		return [];
	}
}
