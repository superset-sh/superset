import type { PageVisibility } from "@superset/shared/usercontent";
import type {
	InviteNewMode,
	ShareAddRequest,
	ShareDirectory,
	ShareGrantee,
	ShareGranteeRef,
} from "../../../ShareAccess";

export type { PageVisibility } from "@superset/shared/usercontent";

export interface PageHeaderOwner {
	id: string;
	name: string;
	email: string;
	image: string | null;
}

export interface PageHeaderVersion {
	version: number;
	label: string | null;
	createdAt: Date | string;
	thumbnailUrl?: string | null;
}

export interface PageHeaderPage {
	id: string;
	title: string;
	url: string;
	visibility: PageVisibility;
	createdByUserId: string | null;
	owner: PageHeaderOwner | null;
	updatedAt: Date | string;
	sharedVersion: number | null;
	latestVersion: number | null;
	servedVersion: number | null;
}

export type PageShareRole = "view" | "comment";

/** Who the page is shared with beyond its general access, and how to change that. */
export interface PageHeaderSharing {
	grantees: ShareGrantee[];
	orgRole: PageShareRole;
	directory: ShareDirectory;
	organizationName: string;
	inviteNew: InviteNewMode;
	onUpgrade: () => void;
	onAdd: (request: ShareAddRequest) => Promise<void>;
	onRemove: (grantee: ShareGranteeRef) => Promise<void>;
	onSetRole: (grantee: ShareGranteeRef, role: PageShareRole) => Promise<void>;
	onSetOrgRole: (role: PageShareRole) => Promise<void>;
	onResendInvite: (invitationId: string) => Promise<void>;
}

export interface PageHeaderActions {
	onSetVisibility: (visibility: PageVisibility) => Promise<void>;
	onSetSharedVersion: (version: number | null) => Promise<void>;
	onDelete: () => Promise<void>;
	onRename: (title: string) => Promise<void>;
	onRefresh: () => void;
	onPreviewVersion: (version: number | null) => void;
	previewVersion?: number | null;
	sharing: PageHeaderSharing;
}
