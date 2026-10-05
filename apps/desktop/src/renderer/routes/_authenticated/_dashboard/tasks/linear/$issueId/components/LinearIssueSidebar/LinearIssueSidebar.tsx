import { Trans, useLingui } from "@lingui/react/macro";
import type { TaskPriority } from "@superset/db/enums";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import { ScrollArea } from "@superset/ui/scroll-area";
import { HiOutlineArrowDownTray, HiOutlineUserCircle } from "react-icons/hi2";
import { LinearAssigneeMenu } from "../../../../components/LinearAssigneeMenu";
import { LinearPriorityMenu } from "../../../../components/LinearPriorityMenu";
import { LinearStatusMenu } from "../../../../components/LinearStatusMenu";
import { PriorityIcon } from "../../../../components/TasksView/components/shared/PriorityIcon";
import { StatusIcon } from "../../../../components/TasksView/components/shared/StatusIcon";
import { useLinearIssueActions } from "../../../../hooks/useLinearIssueActions";
import {
	type LinearIssueDetail,
	statusIconType,
} from "../../../../utils/linearIssueTypes";

interface LinearIssueSidebarProps {
	issue: LinearIssueDetail;
}

const PROPERTY_BUTTON_CLASS =
	"-mx-1 flex w-full items-center gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-muted/50";

export function LinearIssueSidebar({ issue }: LinearIssueSidebarProps) {
	const { t } = useLingui();
	const { update, importToTasks, isImporting } = useLinearIssueActions();
	const priorityLabels: Record<TaskPriority, string> = {
		none: t({ message: "No priority" }),
		urgent: t({ message: "Urgent" }),
		high: t({ message: "High" }),
		medium: t({ message: "Medium" }),
		low: t({ message: "Low" }),
	};

	return (
		<div className="w-64 shrink-0 border-l border-border">
			<ScrollArea className="h-full">
				<div className="space-y-6 p-4">
					<h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
						<Trans>Properties</Trans>
					</h3>
					<div className="space-y-3">
						<LinearStatusMenu
							issue={issue}
							onSelect={(stateId) => update(issue, { stateId })}
						>
							<button type="button" className={PROPERTY_BUTTON_CLASS}>
								<StatusIcon
									type={statusIconType(issue.state.type)}
									color={issue.state.color}
								/>
								<span className="truncate">{issue.state.name}</span>
							</button>
						</LinearStatusMenu>
						<LinearPriorityMenu
							priority={issue.priority}
							onSelect={(priority) => update(issue, { priority })}
						>
							<button type="button" className={PROPERTY_BUTTON_CLASS}>
								<PriorityIcon
									priority={issue.priority}
									statusType={statusIconType(issue.state.type)}
								/>
								<span>{priorityLabels[issue.priority]}</span>
							</button>
						</LinearPriorityMenu>
						<LinearAssigneeMenu
							assigneeId={issue.assignee?.id ?? null}
							onSelect={(assigneeId) => update(issue, { assigneeId })}
						>
							<button type="button" className={PROPERTY_BUTTON_CLASS}>
								{issue.assignee ? (
									<>
										<Avatar
											size="xs"
											fullName={issue.assignee.name}
											image={issue.assignee.avatarUrl ?? undefined}
											className="rounded-full"
										/>
										<span className="truncate">{issue.assignee.name}</span>
									</>
								) : (
									<>
										<HiOutlineUserCircle className="size-5 text-muted-foreground" />
										<span className="text-muted-foreground">
											<Trans>Unassigned</Trans>
										</span>
									</>
								)}
							</button>
						</LinearAssigneeMenu>
					</div>

					<div className="flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">
							<Trans>Team</Trans>
						</span>
						<span className="text-sm">{issue.team.name}</span>
					</div>

					{issue.project && (
						<div className="flex flex-col gap-2">
							<span className="text-xs text-muted-foreground">
								<Trans>Project</Trans>
							</span>
							<span className="text-sm">{issue.project.name}</span>
						</div>
					)}

					<div className="flex flex-col gap-2">
						<span className="text-xs text-muted-foreground">
							<Trans>Labels</Trans>
						</span>
						{issue.labels.length > 0 ? (
							<div className="flex flex-wrap gap-1">
								{issue.labels.map((label) => (
									<span
										key={label.id}
										className="inline-flex items-center gap-1.5 rounded-full border border-border/70 px-2 py-0.5 text-xs"
									>
										<span
											className="size-2 rounded-full"
											style={{ backgroundColor: label.color }}
										/>
										{label.name}
									</span>
								))}
							</div>
						) : (
							<span className="text-sm text-muted-foreground">
								<Trans>No labels</Trans>
							</span>
						)}
					</div>

					<Button
						variant="outline"
						size="sm"
						className="w-full gap-1.5"
						disabled={isImporting}
						onClick={() => importToTasks(issue)}
					>
						<HiOutlineArrowDownTray className="size-4" />
						<Trans>Import to tasks</Trans>
					</Button>
				</div>
			</ScrollArea>
		</div>
	);
}
