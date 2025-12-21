export interface DemoOption {
	label: string;
	videoPath: string;
}

export const DEMO_OPTIONS: readonly DemoOption[] = [
	{
		label: "Use Any Agents",
		videoPath: "/hero/agents.mp4",
	},
	{
		label: "Create Parallel Branches",
		videoPath: "/hero/worktrees.mp4",
	},
	{
		label: "See Changes",
		videoPath: "/hero/changes.mp4",
	},
	{
		label: "Open in Any IDE",
		videoPath: "/hero/open-in.mp4",
	},
] as const;

export const SELECTOR_OPTIONS = DEMO_OPTIONS.map(
	(option) => option.label,
) as readonly string[];

export const DEMO_VIDEOS: Record<string, string> = Object.fromEntries(
	DEMO_OPTIONS.map((option) => [option.label, option.videoPath]),
) as Record<string, string>;
