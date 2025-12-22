export interface DemoOption {
	label: string;
	videoPath: string;
	gradient: string;
}

export const DEMO_OPTIONS: readonly DemoOption[] = [
	{
		label: "Use Any Agents",
		videoPath: "/hero/agents.mp4",
		gradient: "from-rose-900/80 via-pink-950/70 to-rose-950/80",
	},
	{
		label: "Create Parallel Branches",
		videoPath: "/hero/worktrees.mp4",
		gradient: "from-blue-900/80 via-blue-950/70 to-blue-950/80",
	},
	{
		label: "See Changes",
		videoPath: "/hero/changes.mp4",
		gradient: "from-amber-900/80 via-yellow-950/70 to-orange-950/80",
	},
	{
		label: "Open in Any IDE",
		videoPath: "/hero/open-in.mp4",
		gradient: "from-emerald-900/80 via-teal-950/70 to-emerald-950/80",
	},
] as const;

export const SELECTOR_OPTIONS = DEMO_OPTIONS.map(
	(option) => option.label,
) as readonly string[];

export const DEMO_VIDEOS: Record<string, string> = Object.fromEntries(
	DEMO_OPTIONS.map((option) => [option.label, option.videoPath]),
) as Record<string, string>;
