import { useLingui } from "@lingui/react/macro";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { HiOutlineUserCircle } from "react-icons/hi2";
import { useLinearIssueActions } from "../../../../../../hooks/useLinearIssueActions";
import {
	type LinearIssue,
	statusIconType,
} from "../../../../../../utils/linearIssueTypes";
import { LinearAssigneeMenu } from "../../../../../LinearAssigneeMenu";
import { LinearIssueActions } from "../../../../../LinearIssueActions";
import { LinearPriorityMenu } from "../../../../../LinearPriorityMenu";
import { LinearStatusMenu } from "../../../../../LinearStatusMenu";
import { PriorityIcon } from "../../../shared/PriorityIcon";
import { StatusIcon } from "../../../shared/StatusIcon";

interface LinearIssueRowProps {
	issue: LinearIssue;
	showTeam: boolean;
	onOpen: (issue: LinearIssue) => void;
}

export function LinearIssueRow({
	issue,
	showTeam,
	onOpen,
}: LinearIssueRowProps) {
	const { t } = useLingui();
	const { update } = useLinearIssueActions();

	return (
		// biome-ignore lint/a11y/useSemanticElements: row contains nested menus and buttons, so the outer element is a div with role/tabIndex
		<div
			className="group flex h-9 cursor-pointer items-center gap-3 border-b border-border/50 px-4 hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring"
			onClick={() => onOpen(issue)}
			onKeyDown={(event) => {
				if (event.target !== event.currentTarget) return;
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault();
					onOpen(issue);
				}
			}}
			role="button"
			tabIndex={0}
		>
			<LinearPriorityMenu
				priority={issue.priority}
				onSelect={(priority) => update(issue, { priority })}
			>
				<button
					type="button"
					aria-label={t({ message: "Change priority" })}
					className="flex shrink-0 items-center"
					onClick={(event) => event.stopPropagation()}
				>
					<PriorityIcon
						priority={issue.priority}
						statusType={statusIconType(issue.state.type)}
						className="size-4"
					/>
				</button>
			</LinearPriorityMenu>
			<span className="w-20 shrink-0 truncate font-mono text-xs text-muted-foreground tabular-nums">
				{issue.identifier}
			</span>
			<LinearStatusMenu
				issue={issue}
				onSelect={(stateId) => update(issue, { stateId })}
			>
				<button
					type="button"
					title={issue.state.name}
					aria-label={t({ message: `Change status from ${issue.state.name}` })}
					className="flex shrink-0 items-center"
					onClick={(event) => event.stopPropagation()}
				>
					<StatusIcon
						type={statusIconType(issue.state.type)}
						color={issue.state.color}
					/>
				</button>
			</LinearStatusMenu>
			<span className="min-w-0 flex-1 truncate text-sm font-medium">
				{issue.title}
			</span>
			{issue.labels.slice(0, 2).map((label) => (
				<span
					key={label.id}
					className="hidden shrink-0 items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-[11px] text-muted-foreground @2xl:inline-flex"
				>
					<span
						className="size-2 rounded-full"
						style={{ backgroundColor: label.color }}
					/>
					{label.name}
				</span>
			))}
			{showTeam && (
				<span className="hidden shrink-0 text-xs text-muted-foreground @xl:inline">
					{issue.team.key}
				</span>
			)}
			<LinearAssigneeMenu
				assigneeId={issue.assignee?.id ?? null}
				onSelect={(assigneeId) => update(issue, { assigneeId })}
			>
				<button
					type="button"
					title={issue.assignee?.name ?? t({ message: "No assignee" })}
					aria-label={t({ message: "Change assignee" })}
					className="flex shrink-0 items-center"
					onClick={(event) => event.stopPropagation()}
				>
					{issue.assignee ? (
						<Avatar
							size="xs"
							fullName={issue.assignee.name}
							image={issue.assignee.avatarUrl ?? undefined}
							className="rounded-full"
						/>
					) : (
						<HiOutlineUserCircle className="size-5 text-muted-foreground" />
					)}
				</button>
			</LinearAssigneeMenu>
			<LinearIssueActions issue={issue} />
		</div>
	);
}
