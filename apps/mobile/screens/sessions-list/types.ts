/**
 * Sessions-list domain types — mirrors contracts described in
 * plans/chat-mobile-plan/{04-uc-sess, 09-uc-nav}.md and re-exports the
 * relevant molecule/atom prop types for view stories.
 */

export type {
	AppliedFilterTagKind,
	AppliedFilterTagProps,
} from "@/components/AppliedFilterTag";
export type { EmptyStateProps } from "@/components/EmptyState";
export type {
	FilterCheckboxRowKind,
	FilterCheckboxRowProps,
	FilterStatusValue,
} from "@/components/FilterCheckboxRow";
export type {
	ProjectChipHeaderProps,
	ProjectChipHeaderVariant,
} from "@/components/ProjectChipHeader";
export type { ProjectPickerRowProps } from "@/components/ProjectPickerRow";
export type {
	SessionHostKind,
	SessionRowProps,
	SessionStatus,
} from "@/components/SessionRow";
export type { WorkspacePickerRowProps } from "@/components/WorkspacePickerRow";

/**
 * Domain types describing the chat_sessions Electric shape rows the
 * sessions-list reads via TanStack DB. See
 * plans/chat-mobile-plan/11-technical-requirements/01-data-schema.md.
 */
export type ChatSession = {
	id: string;
	title: string;
	branch: string;
	hostName: string;
	hostKind: import("@/components/SessionRow").SessionHostKind;
	status: import("@/components/SessionRow").SessionStatus;
	statusLabel?: string;
	timeLabel: string;
	unread?: boolean;
};

export type Project = {
	id: string;
	name: string;
	workspaceCount: number;
	sessionCount: number;
};

export type WorkspacePickerEntry = {
	id: string;
	branch: string;
	hostName: string;
	hostKind: import("@/components/SessionRow").SessionHostKind;
	sessionCount: number;
	lastActiveTimeLabel?: string;
};

export type FilterValueWorkspace = {
	id: string;
	branch: string;
	hostName: string;
	hostKind: import("@/components/SessionRow").SessionHostKind;
};

export type SessionsFilters = {
	workspaceIds: ReadonlyArray<string>;
	statuses: ReadonlyArray<
		import("@/components/FilterCheckboxRow").FilterStatusValue
	>;
};

/**
 * 5 empty-state variants per UC-NAV-06.
 */
export type SessionsEmptyVariant =
	| "no-projects"
	| "no-workspaces"
	| "no-sessions"
	| "search-no-match"
	| "filters-no-match";
