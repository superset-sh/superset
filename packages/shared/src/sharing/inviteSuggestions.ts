import type {
	InviteNewMode,
	ShareDirectory,
	ShareGrantee,
	SharePerson,
	ShareTeam,
	StagedPick,
} from "./types";

export type SuggestionItem =
	| { kind: "team"; team: ShareTeam; hasAccess: boolean }
	| { kind: "member"; person: SharePerson; hasAccess: boolean }
	| { kind: "heading" }
	| { kind: "invite"; email: string; completion: boolean; invited: boolean }
	| { kind: "invalid"; text: string }
	| { kind: "blocked" }
	| { kind: "empty" };

export const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function isEmail(value: string): boolean {
	return EMAIL_PATTERN.test(value);
}

export function stagedKey(pick: StagedPick): string {
	switch (pick.kind) {
		case "user":
			return `user:${pick.person.userId}`;
		case "team":
			return `team:${pick.team.teamId}`;
		case "email":
			return `email:${pick.email}`;
	}
}

/**
 * What the invite field offers for `query`: matching teams and members first,
 * then, once an address is being typed or nothing matched, a way to invite
 * someone new to the organization.
 */
export function inviteSuggestions({
	query,
	directory,
	grantees,
	staged,
	ownerId,
	inviteNew,
	browse = false,
}: {
	query: string;
	directory: ShareDirectory;
	grantees: ShareGrantee[];
	staged: StagedPick[];
	ownerId: string | null;
	inviteNew: InviteNewMode;
	/** With no query, list every team and member instead of nothing. */
	browse?: boolean;
}): SuggestionItem[] {
	const q = query.trim().toLowerCase();
	if (!q && !browse) return [];

	const stagedKeys = new Set(staged.map(stagedKey));
	const sharedUsers = new Set(
		grantees.flatMap((g) => (g.kind === "user" ? [g.userId] : [])),
	);
	const sharedTeams = new Set(
		grantees.flatMap((g) => (g.kind === "team" ? [g.teamId] : [])),
	);
	const invitedEmails = new Set(
		grantees.flatMap((g) =>
			g.kind === "invitation" ? [g.email.toLowerCase()] : [],
		),
	);
	const memberEmails = new Set(
		directory.members.map((m) => m.email.toLowerCase()),
	);

	const items: SuggestionItem[] = [
		...directory.teams
			.filter(
				(team) =>
					!stagedKeys.has(`team:${team.teamId}`) &&
					team.name.toLowerCase().includes(q),
			)
			.map(
				(team): SuggestionItem => ({
					kind: "team",
					team,
					hasAccess: sharedTeams.has(team.teamId),
				}),
			),
		...directory.members
			.filter(
				(person) =>
					!stagedKeys.has(`user:${person.userId}`) &&
					(person.name.toLowerCase().includes(q) ||
						person.email.toLowerCase().startsWith(q)),
			)
			.map(
				(person): SuggestionItem => ({
					kind: "member",
					person,
					hasAccess:
						person.userId === ownerId || sharedUsers.has(person.userId),
				}),
			),
	];

	const invitable = (email: string) =>
		!memberEmails.has(email) && !stagedKeys.has(`email:${email}`);
	const invites: SuggestionItem[] = [];
	if (isEmail(q)) {
		if (invitable(q)) {
			invites.push({
				kind: "invite",
				email: q,
				completion: false,
				invited: invitedEmails.has(q),
			});
		}
	} else if (!/[\s,;]/.test(q) && (q.includes("@") || items.length === 0)) {
		const [local, domain] = q.split("@");
		const completions = local
			? directory.domains
					.filter((d) => domain === undefined || d.startsWith(domain))
					.map((d) => `${local}@${d}`)
					.filter(invitable)
			: [];
		if (completions.length) {
			invites.push({ kind: "heading" });
			for (const email of completions) {
				invites.push({
					kind: "invite",
					email,
					completion: true,
					invited: invitedEmails.has(email),
				});
			}
		} else if (q.includes("@")) {
			invites.push({ kind: "invalid", text: q });
		}
	}

	if (invites.length && inviteNew === "admins-only") {
		items.push({ kind: "blocked" });
	} else {
		items.push(...invites);
	}
	if (!items.length && q) items.push({ kind: "empty" });
	return items;
}

/** Indexes of the items a person can pick with the keyboard. */
export function pickableIndexes(items: SuggestionItem[]): number[] {
	return items.flatMap((item, index) => {
		switch (item.kind) {
			case "team":
			case "member":
				return item.hasAccess ? [] : [index];
			case "invite":
				return item.invited ? [] : [index];
			case "invalid":
				return [index];
			default:
				return [];
		}
	});
}
