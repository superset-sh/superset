import type { SidebarStatusBucket } from "../../types";

export interface StatusBucketMeta {
	label: string;
	sublabel: string;
	/** Tailwind background class for the header dot / accent. */
	dotClassName: string;
	/** CSS color for the row's left accent border. */
	accentColor: string;
}

/**
 * Per-bucket display metadata. Colors echo the canonical agent glyphs from
 * `shared/tabs-types` (working = amber, agent-finished/`review` = green) so a
 * bucket header matches the row indicators grouped under it. `waiting` takes
 * the green — it holds the agent-finished (`review`) workspaces — so Open PR
 * moves to blue to keep the two apart.
 */
export const STATUS_BUCKET_META: Record<SidebarStatusBucket, StatusBucketMeta> =
	{
		working: {
			label: "Working",
			sublabel: "agent running",
			dotClassName: "bg-amber-500",
			accentColor: "var(--color-amber-500)",
		},
		waiting: {
			label: "Waiting",
			sublabel: "needs response",
			dotClassName: "bg-emerald-500",
			accentColor: "var(--color-emerald-500)",
		},
		open_pr: {
			label: "Open PR",
			sublabel: "open pull request",
			dotClassName: "bg-blue-500",
			accentColor: "var(--color-blue-500)",
		},
		done: {
			label: "Done",
			sublabel: "merged",
			dotClassName: "bg-violet-500",
			accentColor: "var(--color-violet-500)",
		},
		idle: {
			label: "Idle",
			sublabel: "no activity",
			dotClassName: "bg-muted-foreground/50",
			accentColor: "var(--color-muted-foreground)",
		},
	};
