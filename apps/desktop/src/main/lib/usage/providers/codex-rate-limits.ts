import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { collectLogFiles } from "../log-parsers/log-files";

const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const MAX_AGE_DAYS = 14;
// The rate-limit snapshot only changes with new sessions; scanning the newest
// few rollout files is enough to find the most recent reading.
const MAX_FILES = 12;

export interface CodexWindow {
	usedPercent: number;
	windowMinutes: number;
	resetsAt: number | null;
}

export interface CodexRateLimits {
	primary: CodexWindow | null;
	secondary: CodexWindow | null;
	creditBalance: number | null;
	planType: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseWindow(value: unknown): CodexWindow | null {
	if (!isRecord(value)) return null;
	const usedPercent = value.used_percent;
	const windowMinutes = value.window_minutes;
	if (typeof usedPercent !== "number" || typeof windowMinutes !== "number") {
		return null;
	}
	return {
		usedPercent,
		windowMinutes,
		resetsAt: typeof value.resets_at === "number" ? value.resets_at : null,
	};
}

function parseRateLimits(
	payload: Record<string, unknown>,
): CodexRateLimits | null {
	const rateLimits = payload.rate_limits;
	if (!isRecord(rateLimits)) return null;
	const credits = isRecord(rateLimits.credits) ? rateLimits.credits : null;
	return {
		primary: parseWindow(rateLimits.primary),
		secondary: parseWindow(rateLimits.secondary),
		creditBalance:
			credits && typeof credits.balance === "number" ? credits.balance : null,
		planType:
			typeof rateLimits.plan_type === "string" ? rateLimits.plan_type : null,
	};
}

/** Reads the most recent `rate_limits` snapshot Codex wrote to its rollout logs. */
export async function readLatestCodexRateLimits(): Promise<CodexRateLimits | null> {
	const files = await collectLogFiles(
		CODEX_SESSIONS_DIR,
		".jsonl",
		MAX_AGE_DAYS,
	);
	if (files.length === 0) return null;

	const newest = files
		.sort((a, b) => b.mtimeMs - a.mtimeMs)
		.slice(0, MAX_FILES);

	let latestTime = Number.NEGATIVE_INFINITY;
	let latest: CodexRateLimits | null = null;

	for (const file of newest) {
		let content: string;
		try {
			content = await readFile(file.path, "utf8");
		} catch {
			continue;
		}
		for (const raw of content.split("\n")) {
			const trimmed = raw.trim();
			if (!trimmed.includes("rate_limits")) continue;
			let parsed: unknown;
			try {
				parsed = JSON.parse(trimmed);
			} catch {
				continue;
			}
			if (!isRecord(parsed) || !isRecord(parsed.payload)) continue;
			const rateLimits = parseRateLimits(parsed.payload);
			if (!rateLimits) continue;

			const parsedTime =
				typeof parsed.timestamp === "string"
					? new Date(parsed.timestamp).getTime()
					: Number.NaN;
			const time = Number.isNaN(parsedTime) ? file.mtimeMs : parsedTime;
			if (time > latestTime) {
				latestTime = time;
				latest = rateLimits;
			}
		}
	}

	return latest;
}

export function labelForWindowMinutes(minutes: number): string {
	if (minutes >= 43200) return "Monthly";
	if (minutes >= 10080) return "Weekly";
	if (minutes >= 1440) return `${Math.round(minutes / 1440)}-day`;
	if (minutes >= 60) return `${Math.round(minutes / 60)}-hour`;
	return `${minutes}-min`;
}
