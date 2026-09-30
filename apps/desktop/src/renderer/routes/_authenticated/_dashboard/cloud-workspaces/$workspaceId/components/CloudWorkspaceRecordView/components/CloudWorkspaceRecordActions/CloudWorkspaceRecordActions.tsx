import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { ButtonGroup } from "@superset/ui/button-group";
import { LuArchiveRestore, LuArrowRight, LuHash, LuLink } from "react-icons/lu";
import { RecordIconButton } from "renderer/routes/_authenticated/_dashboard/components/RecordIconButton";
import { CloudWorkspaceRecordMenu } from "./components/CloudWorkspaceRecordMenu";

interface CloudWorkspaceRecordActionsProps {
	archivedAt: Date | null;
	onOpenWorkspace: () => void;
	onCopyLink: () => void;
	onCopyId: () => void;
	onSaveAsEnvironment?: () => void;
	onArchive: () => void;
	onUnarchive: () => void;
}

export function CloudWorkspaceRecordActions({
	archivedAt,
	onOpenWorkspace,
	onCopyLink,
	onCopyId,
	onSaveAsEnvironment,
	onArchive,
	onUnarchive,
}: CloudWorkspaceRecordActionsProps) {
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
					label={t({ message: "Copy Workspace ID" })}
					onClick={onCopyId}
				>
					<LuHash className="size-3.5" />
				</RecordIconButton>
				<CloudWorkspaceRecordMenu
					isArchived={archivedAt !== null}
					onSaveAsEnvironment={onSaveAsEnvironment}
					onArchive={onArchive}
					onUnarchive={onUnarchive}
				/>
			</ButtonGroup>
			{archivedAt ? (
				<Button variant="outline" size="sm" onClick={onUnarchive}>
					<LuArchiveRestore className="size-3.5" />
					<Trans>Unarchive</Trans>
				</Button>
			) : (
				<Button variant="outline" size="sm" onClick={onOpenWorkspace}>
					<Trans>Go to workspace</Trans>
					<LuArrowRight className="size-3.5" />
				</Button>
			)}
		</>
	);
}
