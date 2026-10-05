import { useLingui } from "@lingui/react/macro";
import { EditableTitle } from "renderer/routes/_authenticated/_dashboard/components/EditableTitle";
import { ProjectIconPicker } from "renderer/routes/_authenticated/_dashboard/components/ProjectIconPicker";
import { TaskProjectIcon } from "renderer/routes/_authenticated/_dashboard/components/TaskProjectIcon";
import type { ProjectRecord, ProjectRecordChanges } from "../../../../types";

interface ProjectRecordHeaderProps {
	project: Pick<ProjectRecord, "name" | "icon" | "color">;
	onChange: (changes: ProjectRecordChanges) => void;
}

export function ProjectRecordHeader({
	project,
	onChange,
}: ProjectRecordHeaderProps) {
	const { t } = useLingui();
	return (
		<h1 className="m-0 flex items-start gap-2.5">
			<ProjectIconPicker
				icon={project.icon}
				color={project.color}
				onChange={onChange}
			>
				<button
					type="button"
					aria-label={t({ message: "Change icon" })}
					className="mt-0.5 flex size-[26px] shrink-0 items-center justify-center rounded-md hover:bg-fill-hover"
				>
					<TaskProjectIcon
						icon={project.icon}
						color={project.color}
						className="size-[18px]"
					/>
				</button>
			</ProjectIconPicker>
			<EditableTitle
				name={project.name}
				label={t({ message: "Project name" })}
				maxLength={120}
				onRename={(name) => onChange({ name })}
			/>
		</h1>
	);
}
