import { EventEmitter } from "node:events";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Notification } from "electron";
import {
	ensureSupersetHomeDirExists,
	SUPERSET_HOME_DIR,
} from "main/lib/app-environment";
import { ClaudeProvider } from "./providers/claude-provider";
import { CodexProvider } from "./providers/codex-provider";
import { CopilotProvider } from "./providers/copilot-provider";
import { GeminiProvider } from "./providers/gemini-provider";
import type { ProviderCollector } from "./providers/base-provider";
import { getUsageDisplaySettings } from "./usage-settings";
import {
	type ProviderSnapshot,
	USAGE_PROVIDER_LABELS,
} from "./usage-snapshot";

const SNAPSHOT_PATH = join(SUPERSET_HOME_DIR, "usage-snapshot.json");
const POLL_INTERVAL_MS = 5 * 60 * 1000;
const NOTIFY_THRESHOLDS = [95, 80] as const;

export const USAGE_UPDATED_EVENT = "usage-updated";

function reviveSnapshots(raw: unknown): ProviderSnapshot[] {
	if (!Array.isArray(raw)) return [];
	return raw.map((entry) => {
		const snapshot = entry as ProviderSnapshot;
		return {
			...snapshot,
			updatedAt: new Date(snapshot.updatedAt),
			windows: (snapshot.windows ?? []).map((window) => ({
				...window,
				resetAt: window.resetAt ? new Date(window.resetAt) : null,
			})),
		};
	});
}

export class UsageCollector extends EventEmitter {
	private readonly providers: ProviderCollector[] = [
		new ClaudeProvider(),
		new CodexProvider(),
		new CopilotProvider(),
		new GeminiProvider(),
	];
	private snapshots: ProviderSnapshot[] = [];
	private timer: NodeJS.Timeout | null = null;
	private polling: Promise<ProviderSnapshot[]> | null = null;
	private readonly notifiedKeys = new Set<string>();

	start(): void {
		this.snapshots = this.loadPersisted();
		void this.poll();
		this.timer = setInterval(() => void this.poll(), POLL_INTERVAL_MS);
	}

	dispose(): void {
		if (this.timer) clearInterval(this.timer);
		this.timer = null;
		this.removeAllListeners();
	}

	getSnapshots(): ProviderSnapshot[] {
		return this.snapshots;
	}

	async refresh(): Promise<ProviderSnapshot[]> {
		return this.poll();
	}

	private async poll(): Promise<ProviderSnapshot[]> {
		if (this.polling) return this.polling;
		this.polling = (async () => {
			const results = await Promise.all(
				this.providers.map((provider) => provider.collect()),
			);
			this.snapshots = results;
			this.persist(results);
			this.maybeNotify(results);
			this.emit(USAGE_UPDATED_EVENT, results);
			return results;
		})();
		try {
			return await this.polling;
		} finally {
			this.polling = null;
		}
	}

	private loadPersisted(): ProviderSnapshot[] {
		try {
			return reviveSnapshots(JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")));
		} catch {
			return [];
		}
	}

	private persist(snapshots: ProviderSnapshot[]): void {
		try {
			ensureSupersetHomeDirExists();
			writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshots), { mode: 0o600 });
		} catch (error) {
			console.warn("[usage] Failed to persist snapshot:", error);
		}
	}

	private maybeNotify(snapshots: ProviderSnapshot[]): void {
		const settings = getUsageDisplaySettings();
		if (!settings.notifyAt80Pct && !settings.notifyAt95Pct) return;
		if (!Notification.isSupported()) return;

		for (const snapshot of snapshots) {
			for (const window of snapshot.windows) {
				for (const threshold of NOTIFY_THRESHOLDS) {
					if (threshold === 80 && !settings.notifyAt80Pct) continue;
					if (threshold === 95 && !settings.notifyAt95Pct) continue;
					if (window.usedPct < threshold) continue;

					const resetCycle = window.resetAt?.toISOString() ?? "none";
					const key = `${snapshot.providerId}:${window.label}:${threshold}:${resetCycle}`;
					if (this.notifiedKeys.has(key)) break;
					this.notifiedKeys.add(key);

					new Notification({
						title: `${USAGE_PROVIDER_LABELS[snapshot.providerId]} usage at ${Math.round(window.usedPct)}%`,
						body: `${window.label} is ${Math.round(window.usedPct)}% used.`,
						silent: true,
					}).show();
					break;
				}
			}
		}
	}
}

let collector: UsageCollector | null = null;

export function getUsageCollector(): UsageCollector {
	if (!collector) collector = new UsageCollector();
	return collector;
}
