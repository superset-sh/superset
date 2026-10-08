export interface ShareRoleOption {
	id: string;
	label: string;
	description: string;
}

export interface SharePerson {
	userId: string;
	name: string;
	email: string;
	image: string | null;
}

export interface ShareTeam {
	teamId: string;
	name: string;
	memberIds: string[];
}

export type ShareGranteeRef =
	| { kind: "user"; userId: string }
	| { kind: "team"; teamId: string }
	| { kind: "invitation"; invitationId: string };

export type ShareGrantee = { role: string | null } & (
	| ({ kind: "user" } & SharePerson)
	| { kind: "team"; teamId: string; name: string; memberCount: number }
	| { kind: "invitation"; invitationId: string; email: string }
);

/** Who an invite field can find: the organization's members and teams. */
export interface ShareDirectory {
	members: SharePerson[];
	teams: ShareTeam[];
	/** Email domains offered as completions, the organization's own first. */
	domains: string[];
}

/** Whether someone outside the organization can be invited from here. */
export type InviteNewMode = "allowed" | "admins-only" | "upgrade";

export interface ShareAddRequest {
	grantees: ShareGranteeRef[];
	emails: string[];
	role: string;
}

export type StagedPick =
	| { kind: "user"; person: SharePerson }
	| { kind: "team"; team: ShareTeam }
	| { kind: "email"; email: string };
