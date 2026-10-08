import type { ShareDirectory } from "./types";

const FALLBACK_DOMAIN = "gmail.com";

interface MemberRow {
	user: { id: string; name: string; email: string; image: string | null };
}

interface TeamRow {
	id: string;
	name: string;
	members: { userId: string }[];
}

/** The invite field's directory, from an organization's member and team lists. */
export function shareDirectory(
	members: MemberRow[] | undefined,
	teams: TeamRow[] | undefined,
): ShareDirectory {
	return {
		members: (members ?? []).map(({ user }) => ({
			userId: user.id,
			name: user.name,
			email: user.email,
			image: user.image,
		})),
		teams: (teams ?? []).map((team) => ({
			teamId: team.id,
			name: team.name,
			memberIds: team.members.map((m) => m.userId),
		})),
		domains: emailDomains((members ?? []).map(({ user }) => user.email)),
	};
}

/** Domains to complete an address with: the organization's most common first, then a common personal one. */
export function emailDomains(emails: string[]): string[] {
	const counts = new Map<string, number>();
	for (const email of emails) {
		const domain = email.split("@")[1]?.toLowerCase();
		if (domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
	}
	const domains = [...counts.entries()]
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.map(([domain]) => domain);
	return domains.includes(FALLBACK_DOMAIN)
		? domains
		: [...domains, FALLBACK_DOMAIN];
}
