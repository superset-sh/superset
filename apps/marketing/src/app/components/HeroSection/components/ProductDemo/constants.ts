export interface DemoOption {
	label: string;
	videoPath: string;
	colors: readonly [string, string, string, string];
}

export const DEMO_OPTIONS: readonly DemoOption[] = [
	{
		label: "Use Any Agents",
		videoPath: "/hero/agents.mp4",
		colors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"],
	},
	{
		label: "Create Parallel Branches",
		videoPath: "/hero/worktrees.mp4",
		colors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"],
	},
	{
		label: "See Changes",
		videoPath: "/hero/changes.mp4",
		colors: ["#b45309", "#92400e", "#78350f", "#1a1a2e"],
	},
	{
		label: "Open in Any IDE",
		videoPath: "/hero/open-in.mp4",
		colors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
	},
] as const;

export const SELECTOR_OPTIONS = DEMO_OPTIONS.map(
	(option) => option.label,
) as readonly string[];

export const DEMO_VIDEOS: Record<string, string> = Object.fromEntries(
	DEMO_OPTIONS.map((option) => [option.label, option.videoPath]),
) as Record<string, string>;
