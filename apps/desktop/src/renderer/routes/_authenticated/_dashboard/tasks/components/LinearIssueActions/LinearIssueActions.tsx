import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import {
	HiEllipsisHorizontal,
	HiOutlineArrowDownTray,
	HiOutlineArrowTopRightOnSquare,
} from "react-icons/hi2";
import { LuPlus } from "react-icons/lu";
import { useLinearIssueActions } from "../../hooks/useLinearIssueActions";
import type { LinearIssue } from "../../utils/linearIssueTypes";

interface LinearIssueActionsProps {
	issue: LinearIssue;
}

export function LinearIssueActions({ issue }: LinearIssueActionsProps) {
	const { t } = useLingui();
	const { addToWorkspace, importToTasks } = useLinearIssueActions();

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: stops row navigation when using the actions
		<div
			className="flex shrink-0 items-center gap-1"
			onClick={(event) => event.stopPropagation()}
			onKeyDown={(event) => event.stopPropagation()}
		>
			<Button
				variant="outline"
				size="sm"
				title={t({ message: "Add to workspace" })}
				aria-label={t({
					message: `Add ${issue.identifier} to workspace`,
				})}
				className="h-7 gap-1.5 px-2 text-xs"
				onClick={() => addToWorkspace(issue)}
			>
				<LuPlus className="size-3.5" />
				<span className="hidden @lg:inline">
					<Trans>Add to workspace</Trans>
				</span>
			</Button>
			<DropdownMenu>
				<DropdownMenuTrigger asChild>
					<Button
						variant="ghost"
						size="icon-xs"
						aria-label={t({ message: `More actions for ${issue.identifier}` })}
					>
						<HiEllipsisHorizontal className="size-4" />
					</Button>
				</DropdownMenuTrigger>
				<DropdownMenuContent align="end" className="w-44">
					<DropdownMenuItem onSelect={() => importToTasks(issue)}>
						<HiOutlineArrowDownTray className="size-4" />
						<Trans>Import to tasks</Trans>
					</DropdownMenuItem>
					<DropdownMenuItem
						onSelect={() =>
							window.open(issue.url, "_blank", "noopener,noreferrer")
						}
					>
						<HiOutlineArrowTopRightOnSquare className="size-4" />
						<Trans>Open in Linear</Trans>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
		</div>
	);
}
