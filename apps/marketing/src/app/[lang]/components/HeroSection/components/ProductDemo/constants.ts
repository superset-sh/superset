import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import type { ActiveDemo } from "../AppMockup";

export interface DemoOption {
	id: ActiveDemo;
	label: MessageDescriptor;
	videoPath: string;
	colors: readonly [string, string, string, string];
}

export const DEMO_OPTIONS: readonly DemoOption[] = [
	{
		id: "Orchestrate Parallel Agents",
		label: msg({
			message: "Orchestrate Parallel Agents",
		}),
		videoPath: "/hero/agents.mp4",
		colors: ["#7f1d1d", "#991b1b", "#450a0a", "#1a1a2e"],
	},
	{
		id: "Automate Tasks",
		label: msg({
			message: "Automate Tasks",
		}),
		videoPath: "/hero/worktrees.mp4",
		colors: ["#1e40af", "#1e3a8a", "#172554", "#1a1a2e"],
	},
	{
		id: "Remote Access",
		label: msg({
			message: "Remote Access",
		}),
		videoPath: "/hero/open-in.mp4",
		colors: ["#047857", "#065f46", "#064e3b", "#1a1a2e"],
	},
	{
		id: "See Changes",
		label: msg({
			message: "See Changes",
		}),
		videoPath: "/hero/changes.mp4",
		colors: ["#b45309", "#92400e", "#78350f", "#1a1a2e"],
	},
] as const;

export const SELECTOR_OPTIONS = DEMO_OPTIONS.map(
	(option) => option.id,
) as readonly ActiveDemo[];

export const DEMO_VIDEOS: Record<string, string> = Object.fromEntries(
	DEMO_OPTIONS.map((option) => [option.id, option.videoPath]),
) as Record<string, string>;
