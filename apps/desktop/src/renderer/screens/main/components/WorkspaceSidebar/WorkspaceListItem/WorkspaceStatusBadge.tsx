import { cn } from "@superset/ui/utils";
import { LuCircleDot, LuGitMerge, LuGitPullRequest } from "react-icons/lu";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { transformPrUrl } from "renderer/utils/pr-url";
import { DEFAULT_PR_LINK_PROVIDER } from "shared/constants";
import { STROKE_WIDTH } from "../constants";

type PRState = "open" | "merged" | "closed" | "draft";

interface WorkspaceStatusBadgeProps {
	state: PRState;
	prNumber?: number;
	prUrl?: string;
	className?: string;
}

export function WorkspaceStatusBadge({
	state,
	prNumber,
	prUrl,
	className,
}: WorkspaceStatusBadgeProps) {
	const openUrl = electronTrpc.external.openUrl.useMutation();
	const { data: prLinkSettings } =
		electronTrpc.settings.getPrLinkProvider.useQuery();
	const prProvider = prLinkSettings?.provider ?? DEFAULT_PR_LINK_PROVIDER;
	const prCustomDomain = prLinkSettings?.customDomain;
	const iconClass = "w-3 h-3";

	const config = {
		open: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-emerald-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-emerald-500/10",
			hoverBgColor: "hover:bg-emerald-500/30",
		},
		merged: {
			icon: (
				<LuGitMerge
					className={cn(iconClass, "text-purple-500")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-purple-500/10",
			hoverBgColor: "hover:bg-purple-500/30",
		},
		closed: {
			icon: (
				<LuCircleDot
					className={cn(iconClass, "text-destructive")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-destructive/10",
			hoverBgColor: "hover:bg-destructive/30",
		},
		draft: {
			icon: (
				<LuGitPullRequest
					className={cn(iconClass, "text-muted-foreground")}
					strokeWidth={STROKE_WIDTH}
				/>
			),
			bgColor: "bg-muted",
			hoverBgColor: "hover:bg-muted/70",
		},
	};

	const { icon, bgColor, hoverBgColor } = config[state];

	const handleClick = (e: React.MouseEvent) => {
		if (prUrl) {
			e.stopPropagation();
			openUrl.mutate(transformPrUrl(prUrl, prProvider, prCustomDomain));
		}
	};

	const isClickable = !!prUrl;

	return (
		<button
			type="button"
			onClick={handleClick}
			disabled={!isClickable}
			className={cn(
				"flex items-center justify-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] leading-none shrink-0 transition-colors",
				bgColor,
				isClickable && [hoverBgColor, "cursor-pointer"],
				!isClickable && "cursor-default",
				className,
			)}
		>
			{icon}
			{prNumber && (
				<span className="text-muted-foreground font-mono tabular-nums leading-none">
					#{prNumber}
				</span>
			)}
		</button>
	);
}
