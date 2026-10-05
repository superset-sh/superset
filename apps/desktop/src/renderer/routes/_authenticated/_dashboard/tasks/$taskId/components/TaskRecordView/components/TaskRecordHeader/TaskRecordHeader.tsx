import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { CloudWorkspacePersonLink } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePersonLink";
import { EditableTitle } from "renderer/routes/_authenticated/_dashboard/components/EditableTitle";
import type { TaskRecord } from "../../../../types";

interface TaskRecordHeaderProps {
	task: TaskRecord;
	now: Date;
	onOpenPerson: (userId: string) => void;
	onRename: (title: string) => void;
}

export function TaskRecordHeader({
	task,
	now,
	onOpenPerson,
	onRename,
}: TaskRecordHeaderProps) {
	const { t } = useLingui();
	const { formatCompactRelativeTime } = useFormat();
	const createdAgo = formatCompactRelativeTime(task.createdAt, now);
	const creator = task.creator;
	return (
		<div>
			<h1 className="m-0 flex items-start gap-2.5">
				<EditableTitle
					name={task.title}
					label={t({ message: "Task title" })}
					maxLength={500}
					onRename={onRename}
				/>
			</h1>
			<div className="mt-2 text-[13px] leading-6 text-muted-foreground">
				{creator ? (
					<span>
						<Trans>
							Created by{" "}
							<CloudWorkspacePersonLink
								person={{
									userId: creator.id,
									name: creator.name,
									image: creator.image,
								}}
								onOpen={onOpenPerson}
							/>{" "}
							· {createdAgo}
						</Trans>
					</span>
				) : (
					<span>
						<Trans>Created {createdAgo}</Trans>
					</span>
				)}
			</div>
		</div>
	);
}
