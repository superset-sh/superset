import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import {
	LuBookOpen,
	LuGitPullRequest,
	LuGlobe,
	LuListChecks,
	LuMessageSquare,
	LuMonitor,
	LuNetwork,
	LuRepeat,
	LuRocket,
	LuStethoscope,
	LuWrench,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Skills can ship their own artwork (`icon.svg|png` in the skill folder, or
 * the `icon_small` their agents/openai.yaml names); bundled skills without
 * one get a per-skill default glyph.
 */
const DEFAULT_SKILL_ICONS: Record<string, IconType> = {
	"10x": LuRocket,
	automate: LuRepeat,
	browser: LuGlobe,
	computer: LuMonitor,
	contribute: LuGitPullRequest,
	doctor: LuStethoscope,
	feedback: LuMessageSquare,
	orchestrate: LuNetwork,
	setup: LuWrench,
	standup: LuListChecks,
};

interface SkillIconProps {
	skillName: string;
	/** `undefined` looks the icon up by skill name; `null` means the skill has none. */
	iconDataUri?: string | null;
	brandColor?: string | null;
	className?: string;
}

export function SkillIcon({
	skillName,
	iconDataUri,
	brandColor,
	className,
}: SkillIconProps) {
	const { data: icons } = electronTrpc.skills.listIcons.useQuery(undefined, {
		enabled: iconDataUri === undefined,
	});
	const resolved = iconDataUri === undefined ? icons?.[skillName] : iconDataUri;
	const Icon = DEFAULT_SKILL_ICONS[skillName] ?? LuBookOpen;

	if (resolved) {
		return (
			<img
				src={resolved}
				alt=""
				className={cn(
					"shrink-0 rounded-md object-contain",
					className ?? "size-8",
				)}
			/>
		);
	}
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded-md bg-muted/40",
				className ?? "size-8",
			)}
		>
			<Icon
				className="size-1/2 text-muted-foreground"
				style={brandColor ? { color: brandColor } : undefined}
			/>
		</div>
	);
}
