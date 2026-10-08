import type { ShareRoleOption } from "@superset/shared/sharing";
import type { ReactNode } from "react";

export type {
	InviteNewMode,
	ShareAddRequest,
	ShareDirectory,
	ShareGrantee,
	ShareGranteeRef,
	SharePerson,
	ShareRoleOption,
	ShareTeam,
	StagedPick,
} from "@superset/shared/sharing";

export interface ShareGeneralOption {
	value: string;
	label: string;
	icon: ReactNode;
}

export interface ShareConfirmation {
	title: string;
	description: string;
	actionLabel: string;
}

export interface ShareGeneralAccess {
	value: string;
	options: ShareGeneralOption[];
	hint: string;
	onChange: (value: string) => Promise<void>;
	/** Asked before a change; return null to apply it without asking. */
	confirm?: (from: string, to: string) => ShareConfirmation | null;
	/** What general access lets people do, when that is a choice. */
	role?: {
		value: string;
		options: ShareRoleOption[];
		/** General access values the role applies to. */
		appliesTo: string[];
		onChange: (role: string) => Promise<void>;
	};
}
