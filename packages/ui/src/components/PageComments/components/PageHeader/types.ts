import type { PageVisibility } from "@superset/shared/usercontent";

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

export interface PageHeaderActions {
	onSetVisibility: (visibility: PageVisibility) => Promise<void>;
	onSetSharedVersion: (version: number | null) => Promise<void>;
	onDelete: () => Promise<void>;
	onRename: (title: string) => Promise<void>;
	onRefresh: () => void;
	onPreviewVersion: (version: number | null) => void;
	previewVersion?: number | null;
}
