import {
	Cloud,
	Coffee,
	Heart,
	Moon,
	Puzzle,
	Rocket,
	Sparkles,
	Star,
	Sun,
	Zap,
} from "lucide-react";

// Playful icon set for workspaces
export const WORKSPACE_ICONS = [
	Star,
	Moon,
	Sun,
	Zap,
	Puzzle,
	Heart,
	Sparkles,
	Cloud,
	Rocket,
	Coffee,
];

// Get consistent icon for workspace based on ID
export const getWorkspaceIcon = (workspaceId: string) => {
	const hash = workspaceId
		.split("")
		.reduce((acc, char) => acc + char.charCodeAt(0), 0);
	return WORKSPACE_ICONS[hash % WORKSPACE_ICONS.length];
};
