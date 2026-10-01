import { Trans } from "@lingui/react/macro";
import type { TaskProjectState } from "@superset/db/schema";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { LuCalendar, LuCalendarArrowUp, LuCircleUser } from "react-icons/lu";
import {
	ProjectDatePicker,
	projectDate,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectDatePicker";
import { ProjectLeadPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectLeadPicker";
import { ProjectStateIcon } from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { ProjectStatePicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectStatePicker";
import { useProjectStateLabels } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectStateLabels";
import { ProjectPropertyChip } from "./components/ProjectPropertyChip";

export interface ProjectProperties {
	state: TaskProjectState;
	leadUserId: string | null;
	startDate: string | null;
	targetDate: string | null;
}

interface ProjectPropertyChipsProps {
	value: ProjectProperties;
	people: { id: string; name: string; image: string | null }[];
	onInvite?: () => void;
	onChange: (changes: Partial<ProjectProperties>) => void;
}

export function ProjectPropertyChips({
	value,
	people,
	onInvite,
	onChange,
}: ProjectPropertyChipsProps) {
	const { formatDate } = useFormat();
	const stateLabels = useProjectStateLabels();
	const lead = people.find((person) => person.id === value.leadUserId) ?? null;
	const shortDate = (date: string) =>
		formatDate(projectDate(date), { month: "short", day: "numeric" });

	return (
		<div className="flex flex-wrap items-center gap-1.5">
			<ProjectStatePicker
				value={value.state}
				onChange={(state) => onChange({ state })}
			>
				<ProjectPropertyChip isSet>
					<ProjectStateIcon state={value.state} />
					{stateLabels[value.state]}
				</ProjectPropertyChip>
			</ProjectStatePicker>
			<ProjectLeadPicker
				people={people}
				onInvite={onInvite}
				value={value.leadUserId}
				onChange={(leadUserId) => onChange({ leadUserId })}
			>
				<ProjectPropertyChip isSet={lead !== null}>
					{lead ? (
						<>
							<AvatarStack people={[lead]} size={16} surface="popover" />
							<span className="max-w-32 truncate">{lead.name}</span>
						</>
					) : (
						<>
							<LuCircleUser className="size-3.5" />
							<Trans>Lead</Trans>
						</>
					)}
				</ProjectPropertyChip>
			</ProjectLeadPicker>
			<ProjectDatePicker
				value={value.startDate}
				onChange={(startDate) => onChange({ startDate })}
			>
				<ProjectPropertyChip isSet={value.startDate !== null}>
					<LuCalendarArrowUp className="size-3.5" />
					{value.startDate ? (
						shortDate(value.startDate)
					) : (
						<Trans context="project date">Start</Trans>
					)}
				</ProjectPropertyChip>
			</ProjectDatePicker>
			<ProjectDatePicker
				value={value.targetDate}
				onChange={(targetDate) => onChange({ targetDate })}
			>
				<ProjectPropertyChip isSet={value.targetDate !== null}>
					<LuCalendar className="size-3.5" />
					{value.targetDate ? (
						shortDate(value.targetDate)
					) : (
						<Trans context="project date">Target</Trans>
					)}
				</ProjectPropertyChip>
			</ProjectDatePicker>
		</div>
	);
}
