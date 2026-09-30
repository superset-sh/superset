import type { CloudWorkspaceRow } from "renderer/hooks/useCloudWorkspaces";
import {
	ACTIVE_WITHIN_MS,
	CloudWorkspacePresenceStack,
} from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspacePresenceStack";
import { CloudWorkspaceShareButton } from "renderer/routes/_authenticated/_dashboard/components/CloudWorkspaceShareButton";

interface CloudWorkspaceRecordSharingProps {
	workspaceId: string;
	archivedAt: Date | null;
	people: CloudWorkspaceRow["presence"];
	owner: CloudWorkspaceRow["createdBy"];
	visibility: CloudWorkspaceRow["visibility"];
	canEditSharing: boolean;
	viewerId: string | undefined;
	now: Date;
	onOpenPerson: (userId: string) => void;
	onSetVisibility: (
		visibility: CloudWorkspaceRow["visibility"],
	) => Promise<unknown>;
}

export function CloudWorkspaceRecordSharing({
	workspaceId,
	archivedAt,
	people,
	owner,
	visibility,
	canEditSharing,
	viewerId,
	now,
	onOpenPerson,
	onSetVisibility,
}: CloudWorkspaceRecordSharingProps) {
	return (
		<div className="flex shrink-0 items-center gap-3">
			<CloudWorkspaceShareButton
				workspaceId={workspaceId}
				owner={owner}
				visibility={visibility}
				canEdit={canEditSharing}
				onSetVisibility={onSetVisibility}
			/>
			<CloudWorkspacePresenceStack
				people={people}
				viewerId={viewerId}
				now={now}
				activeWithinMs={archivedAt ? 0 : ACTIVE_WITHIN_MS}
				onOpenPerson={onOpenPerson}
			/>
		</div>
	);
}
