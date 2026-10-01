import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import type { SyntheticEvent } from "react";
import { LuCalendar, LuCircleUser } from "react-icons/lu";
import {
	ProjectDatePicker,
	projectDate,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectDatePicker";
import { ProjectIconPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectIconPicker";
import { ProjectLeadPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectLeadPicker";
import { ProjectStateIcon } from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { ProjectStatePicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectStatePicker";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import { useProjectStateLabels } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectStateLabels";
import type { ProjectChanges, TaskProjectRow } from "../../../../types";

const CELL_BUTTON =
	"-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground hover:bg-fill-hover hover:text-foreground data-[state=open]:bg-fill-hover";
const EMPTY_CELL_BUTTON = `${CELL_BUTTON} invisible group-hover/row:visible data-[state=open]:visible focus-visible:visible`;

const stopRowEvent = (event: SyntheticEvent) => event.stopPropagation();

interface ProjectListRowProps {
	project: TaskProjectRow;
	people: { id: string; name: string; image: string | null }[];
	onInvite?: () => void;
	onOpen: () => void;
	onUpdate: (changes: ProjectChanges) => void;
}

export function ProjectListRow({
	project,
	people,
	onInvite,
	onOpen,
	onUpdate,
}: ProjectListRowProps) {
	const { t } = useLingui();
	const { formatDate } = useFormat();
	const stateLabels = useProjectStateLabels();
	return (
		<tr
			onClick={onOpen}
			className="group/row h-11 cursor-pointer border-b border-border/50 hover:bg-fill-hover"
		>
			<td className="pr-3 pl-4">
				<span className="flex min-w-0 items-center gap-2">
					<ProjectIconPicker
						icon={project.icon}
						color={project.color}
						onChange={onUpdate}
					>
						<button
							type="button"
							aria-label={t({ message: "Change icon" })}
							onClick={stopRowEvent}
							className="-m-1 flex rounded-sm p-1 hover:bg-fill-hover"
						>
							<TaskProjectIcon icon={project.icon} color={project.color} />
						</button>
					</ProjectIconPicker>
					<button
						type="button"
						onClick={(event) => {
							event.stopPropagation();
							onOpen();
						}}
						className="min-w-0 truncate text-left text-sm font-medium focus-visible:underline focus-visible:outline-none"
					>
						{project.name}
					</button>
				</span>
			</td>
			<td className="pr-4" onClick={stopRowEvent} onKeyDown={stopRowEvent}>
				<ProjectLeadPicker
					people={people}
					onInvite={onInvite}
					value={project.lead?.userId ?? null}
					onChange={(leadUserId) => onUpdate({ leadUserId })}
				>
					{project.lead ? (
						<button type="button" className={CELL_BUTTON}>
							<AvatarStack
								people={[
									{
										id: project.lead.userId,
										name: project.lead.name,
										image: project.lead.image,
									},
								]}
								size={18}
							/>
							<span className="max-w-32 truncate">{project.lead.name}</span>
						</button>
					) : (
						<button type="button" className={EMPTY_CELL_BUTTON}>
							<LuCircleUser className="size-4" />
							<Trans>Lead</Trans>
						</button>
					)}
				</ProjectLeadPicker>
			</td>
			<td className="pr-4">
				<span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
					{project.taskCount}
				</span>
			</td>
			<td className="pr-4">
				<span className="block text-xs whitespace-nowrap text-muted-foreground tabular-nums">
					{project.workspaceCount}
				</span>
			</td>
			<td className="pr-4" onClick={stopRowEvent} onKeyDown={stopRowEvent}>
				<ProjectDatePicker
					value={project.targetDate}
					onChange={(targetDate) => onUpdate({ targetDate })}
				>
					{project.targetDate ? (
						<button type="button" className={CELL_BUTTON}>
							{formatDate(projectDate(project.targetDate), {
								month: "short",
								day: "numeric",
							})}
						</button>
					) : (
						<button type="button" className={EMPTY_CELL_BUTTON}>
							<LuCalendar className="size-3.5" />
							<Trans>Set date</Trans>
						</button>
					)}
				</ProjectDatePicker>
			</td>
			<td className="pr-4" onClick={stopRowEvent} onKeyDown={stopRowEvent}>
				<Tooltip delayDuration={600}>
					<TooltipTrigger asChild>
						<span className="flex w-fit">
							<ProjectStatePicker
								value={project.state}
								onChange={(state) => onUpdate({ state })}
							>
								<button
									type="button"
									aria-label={stateLabels[project.state]}
									className="-m-1.5 flex rounded-md p-1.5 hover:bg-fill-hover data-[state=open]:bg-fill-hover"
								>
									<ProjectStateIcon state={project.state} />
								</button>
							</ProjectStatePicker>
						</span>
					</TooltipTrigger>
					<TooltipContent>{stateLabels[project.state]}</TooltipContent>
				</Tooltip>
			</td>
		</tr>
	);
}
