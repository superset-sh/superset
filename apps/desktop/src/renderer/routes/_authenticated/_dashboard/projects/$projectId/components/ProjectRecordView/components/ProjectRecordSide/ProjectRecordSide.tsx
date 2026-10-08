import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { AvatarStack } from "@superset/ui/atoms/AvatarStack";
import { CloudSection } from "renderer/routes/_authenticated/_dashboard/components/CloudSection";
import {
	ProjectDatePicker,
	projectDate,
} from "renderer/routes/_authenticated/_dashboard/components/ProjectDatePicker";
import { ProjectLeadPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectLeadPicker";
import { ProjectStateIcon } from "renderer/routes/_authenticated/_dashboard/components/ProjectStateIcon";
import { ProjectStatePicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectStatePicker";
import { PropertyRow } from "renderer/routes/_authenticated/_dashboard/components/PropertyRow";
import { useProjectStateLabels } from "renderer/routes/_authenticated/_dashboard/hooks/useProjectStateLabels";
import type { ProjectRecord, ProjectRecordChanges } from "../../../../types";

const VALUE_BUTTON =
	"-mx-1 inline-flex items-center gap-1.5 rounded-sm px-1 py-0.5 text-left hover:bg-fill-hover focus-visible:bg-fill-hover focus-visible:outline-none data-[state=open]:bg-fill-hover";
const EMPTY_VALUE = "text-muted-foreground";

interface ProjectRecordSideProps {
	project: ProjectRecord;
	people: { id: string; name: string; image: string | null }[];
	onInvite?: () => void;
	onChange: (changes: ProjectRecordChanges) => void;
}

export function ProjectRecordSide({
	project,
	people,
	onInvite,
	onChange,
}: ProjectRecordSideProps) {
	const { formatDate } = useFormat();
	const stateLabels = useProjectStateLabels();
	const date = (value: string) =>
		formatDate(projectDate(value), {
			month: "short",
			day: "numeric",
			year: "numeric",
		});

	return (
		<aside className="space-y-4 px-3 py-[18px] text-[13px] @min-[900px]:pt-1">
			<CloudSection
				title={<Trans>Properties</Trans>}
				titleClassName="@min-[900px]:hidden"
			>
				<PropertyRow label={<Trans>Status</Trans>}>
					<ProjectStatePicker
						value={project.state}
						onChange={(state) => onChange({ state })}
					>
						<button type="button" className={VALUE_BUTTON}>
							<ProjectStateIcon state={project.state} />
							{stateLabels[project.state]}
						</button>
					</ProjectStatePicker>
				</PropertyRow>
				<PropertyRow label={<Trans>Lead</Trans>}>
					<ProjectLeadPicker
						people={people}
						onInvite={onInvite}
						value={project.lead?.id ?? null}
						onChange={(leadUserId) => onChange({ leadUserId })}
					>
						<button type="button" className={VALUE_BUTTON}>
							{project.lead ? (
								<>
									<AvatarStack people={[project.lead]} size={18} />
									{project.lead.name}
								</>
							) : (
								<span className={EMPTY_VALUE}>
									<Trans>No lead</Trans>
								</span>
							)}
						</button>
					</ProjectLeadPicker>
				</PropertyRow>
				<PropertyRow label={<Trans>Start date</Trans>}>
					<ProjectDatePicker
						value={project.startDate}
						onChange={(startDate) => onChange({ startDate })}
					>
						<button type="button" className={VALUE_BUTTON}>
							{project.startDate ? (
								date(project.startDate)
							) : (
								<span className={EMPTY_VALUE}>
									<Trans>Set date</Trans>
								</span>
							)}
						</button>
					</ProjectDatePicker>
				</PropertyRow>
				<PropertyRow label={<Trans>Target date</Trans>}>
					<ProjectDatePicker
						value={project.targetDate}
						onChange={(targetDate) => onChange({ targetDate })}
					>
						<button type="button" className={VALUE_BUTTON}>
							{project.targetDate ? (
								date(project.targetDate)
							) : (
								<span className={EMPTY_VALUE}>
									<Trans>Set date</Trans>
								</span>
							)}
						</button>
					</ProjectDatePicker>
				</PropertyRow>
			</CloudSection>
		</aside>
	);
}
