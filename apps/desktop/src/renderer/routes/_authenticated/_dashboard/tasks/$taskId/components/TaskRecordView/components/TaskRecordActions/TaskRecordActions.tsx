import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import { LuArrowRight, LuHash, LuLink } from "react-icons/lu";
import { RecordIconButton } from "renderer/routes/_authenticated/_dashboard/components/RecordIconButton";
import { RunInWorkspacePopoverV2 } from "../../../../../components/RunInWorkspacePopoverV2";
import { TaskRecordMenu } from "./components/TaskRecordMenu";

interface TaskRecordActionsProps {
	task: {
		id: string;
		slug: string;
		title: string;
		description: string | null;
		branch: string | null;
	};
	onCopyLink: () => void;
	onCopyId: () => void;
	onOpenExternal?: () => void;
	onDelete: () => void;
}

export function TaskRecordActions({
	task,
	onCopyLink,
	onCopyId,
	onOpenExternal,
	onDelete,
}: TaskRecordActionsProps) {
	const { t } = useLingui();
	return (
		<>
			<ButtonGroup>
				<RecordIconButton
					label={t({ message: "Copy link" })}
					onClick={onCopyLink}
				>
					<LuLink className="size-3.5" />
				</RecordIconButton>
				<RecordIconButton
					label={t({ message: "Copy task ID" })}
					onClick={onCopyId}
				>
					<LuHash className="size-3.5" />
				</RecordIconButton>
				<TaskRecordMenu onOpenExternal={onOpenExternal} onDelete={onDelete} />
			</ButtonGroup>
			<RunInWorkspacePopoverV2
				tasks={[task]}
				onComplete={() => {}}
				align="end"
				trigger={
					<Button
						variant="outline"
						size="sm"
						aria-label={t({ message: "Create workspace" })}
					>
						<span className="hidden @min-[18rem]/record-actions:inline">
							<Trans>Create workspace</Trans>
						</span>
						<LuArrowRight className="size-3.5" />
					</Button>
				}
			/>
		</>
	);
}
