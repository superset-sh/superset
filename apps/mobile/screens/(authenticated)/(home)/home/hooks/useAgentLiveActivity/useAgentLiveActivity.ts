import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import LiveActivity, {
	type AgentRow,
	type AgentSnapshot,
	orderRows,
} from "@superset/live-activity";
import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import type { TerminalAttention, TerminalRowData } from "../useHostTerminals";

/**
 * Rows the Lock Screen card can actually show. Four is the measured ceiling:
 * a fifth pushes the card past the 160pt height at which the system truncates
 * it. Everything beyond becomes the "+N more" line.
 */
const MAX_ROWS = 4;

export interface LiveActivityProject {
	id: string;
	name: string;
	iconUrl?: string | null;
}

/**
 * Structural, not `HostWorkspaceItem`: the hook needs four fields and binding
 * it to the host row would couple this surface to the whole schema for no gain.
 */
export interface LiveActivityWorkspace {
	id: string;
	name: string;
	branch?: string | null;
	projectId?: string | null;
}

/** "12m", "1h", "3d" — the app's compact style without the "ago" suffix. */
function elapsedLabel(since: number, now: number): string {
	const minutes = Math.max(1, Math.round((now - since) / 60_000));
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.round(minutes / 60);
	return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}

export function useAgentLiveActivity({
	terminalsByWorkspace,
	workspaces,
	projects,
	enabled = true,
}: {
	terminalsByWorkspace: ReadonlyMap<string, TerminalRowData[]>;
	workspaces: readonly LiveActivityWorkspace[];
	projects: readonly LiveActivityProject[];
	enabled?: boolean;
}): void {
	const { t } = useLingui();
	const activityId = useRef<string | null>(null);
	const lastPayload = useRef<string | null>(null);
	// Bumped on every run so a slow icon download cannot post a snapshot the
	// hook has already moved past — or resurrect one after unmount.
	const runId = useRef(0);
	// Icons are cached once per project per launch: the file already on disk
	// is reused, so this only ever pays for projects newly on the card.
	const cachedIcons = useRef<Map<string, string>>(new Map());

	useEffect(() => {
		if (!enabled) return;
		if (!LiveActivity.areActivitiesEnabled()) return;
		// A Live Activity can only be started from the foreground —
		// `ActivityAuthorizationError.visibility` otherwise.
		if (AppState.currentState !== "active") return;

		const projectById = new Map(projects.map((p) => [p.id, p]));
		const workspaceById = new Map(workspaces.map((w) => [w.id, w]));
		const now = Date.now();

		const statusWord: Record<TerminalAttention, string> = {
			permission: t({ message: "Needs you", context: "agent status" }),
			failed: t({ message: "Failed", context: "agent status" }),
			review: t({ message: "Review", context: "agent status" }),
			working: t({ message: "Working", context: "agent status" }),
		};

		const all: AgentRow[] = [];
		for (const [workspaceId, terminals] of terminalsByWorkspace) {
			const workspace = workspaceById.get(workspaceId);
			if (!workspace) continue;
			const project = workspace.projectId
				? projectById.get(workspace.projectId)
				: undefined;
			for (const terminal of terminals) {
				if (!terminal.attention) continue;
				all.push({
					id: terminal.terminalId,
					workspaceId,
					branch: workspace.branch ?? workspace.name,
					project: project?.name ?? "",
					status: statusWord[terminal.attention],
					state: terminal.attention,
					elapsed: elapsedLabel(terminal.lastEventAt ?? terminal.ts, now),
				});
			}
		}

		if (all.length === 0) {
			runId.current += 1;
			if (activityId.current || LiveActivity.activeIds().length > 0) {
				void LiveActivity.endAll();
				activityId.current = null;
				lastPayload.current = null;
			}
			return;
		}

		const total = all.length;
		const ranked = orderRows(all);
		const shown = ranked.slice(0, MAX_ROWS);
		const hidden = ranked.length - shown.length;
		const needing = all.filter((row) => row.state === "permission").length;

		const snapshot: AgentSnapshot = {
			// The card renders these verbatim — no pluralisation layer sits below
			// a pre-formatted string, so "1 agents working" would ship as-is.
			headline: needing
				? `${plural(needing, { one: "# needs you", other: "# need you" })} · ${plural(
						total,
						{ one: "# agent", other: "# agents" },
					)}`
				: plural(total, {
						one: "# agent working",
						other: "# agents working",
					}),
			rows: shown,
			topState: shown[0]?.state ?? "working",
			machineName: "",
			staleDetail: t({ message: "Not updating", context: "agent status" }),
			// Updates only arrive while the app is in the foreground, so the card
			// has to admit when it has stopped hearing anything rather than leave
			// a stale "Working" on the Lock Screen. Two minutes is well past the
			// 5s poll that feeds it.
			staleAfterSeconds: 120,
			...(hidden > 0 ? { more: t`+${hidden} more` } : {}),
		};

		// The card is only worth waking for when something it shows changed.
		const payload = JSON.stringify(snapshot);
		if (payload === lastPayload.current) return;
		lastPayload.current = payload;

		runId.current += 1;
		const generation = runId.current;
		void (async () => {
			for (const row of shown) {
				const project = workspaceById.get(row.workspaceId)?.projectId;
				const icon = project ? projectById.get(project) : undefined;
				if (!icon?.iconUrl || cachedIcons.current.has(icon.id)) continue;
				try {
					// The extension has no network of its own, so the app writes
					// icons into the shared App Group container for it to read.
					cachedIcons.current.set(
						icon.id,
						await LiveActivity.cacheIcon(icon.id, icon.iconUrl),
					);
				} catch {
					// A missing icon falls back to the project's initial, which is
					// what ProjectAvatar draws everywhere else.
				}
			}
			const withIcons: AgentSnapshot = {
				...snapshot,
				rows: shown.map((row) => {
					const projectId = workspaceById.get(row.workspaceId)?.projectId;
					const file = projectId
						? cachedIcons.current.get(projectId)
						: undefined;
					return file ? { ...row, iconFile: file } : row;
				}),
			};
			if (generation !== runId.current) return;
			try {
				// ActivityKit is the source of truth, not our ref: an activity can
				// outlive the JS context (relaunch) or be dismissed by the user,
				// and either way a stale ref would silently no-op every update or
				// start a second card.
				const live = LiveActivity.activeIds();
				const existing =
					activityId.current && live.includes(activityId.current)
						? activityId.current
						: (live[0] ?? null);
				if (existing) {
					activityId.current = existing;
					await LiveActivity.update(existing, withIcons);
				} else {
					activityId.current = await LiveActivity.start(withIcons);
				}
			} catch {
				// Denied, or the device is at its concurrent-activity limit.
				activityId.current = null;
				lastPayload.current = null;
			}
		})();
	}, [terminalsByWorkspace, workspaces, projects, enabled, t]);

	useEffect(() => {
		return () => {
			runId.current += 1;
			if (activityId.current) void LiveActivity.endAll();
		};
	}, []);
}
