import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import {
	LuGitPullRequest,
	LuGitPullRequestCreate,
	LuGlobe,
	LuListChecks,
	LuMessageSquare,
	LuMonitor,
	LuNetwork,
	LuRepeat,
	LuRocket,
	LuSparkles,
	LuStethoscope,
	LuWrench,
} from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";

/**
 * Skills can ship their own artwork as `skills/<name>/icon.svg|png` in the
 * plugin bundle (served as data URIs by plugins.listSkillIcons); skills
 * without one get a per-skill default glyph.
 */
const DEFAULT_SKILL_ICONS: Record<string, IconType> = {
	"10x": LuRocket,
	automate: LuRepeat,
	browser: LuGlobe,
	computer: LuMonitor,
	contribute: LuGitPullRequest,
	"create-pr": LuGitPullRequestCreate,
	doctor: LuStethoscope,
	feedback: LuMessageSquare,
	orchestrate: LuNetwork,
	setup: LuWrench,
	standup: LuListChecks,
};

interface SkillIconProps {
	skillName: string;
	className?: string;
}

export function SkillIcon({ skillName, className }: SkillIconProps) {
	const { data: icons } = electronTrpc.plugins.listSkillIcons.useQuery();
	const iconUri = icons?.[skillName];
	const Icon = DEFAULT_SKILL_ICONS[skillName] ?? LuSparkles;

	if (iconUri !== undefined) {
		return (
			<img
				src={iconUri}
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
			<Icon className="size-1/2 text-muted-foreground" />
		</div>
	);
}
