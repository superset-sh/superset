import * as p from "@clack/prompts";
import { CLIError, isAgentMode } from "@superset/cli-framework";
import type { ApiClient } from "./api-client";

export interface OrgChoice {
	id: string;
	name: string;
	slug: string;
}

// Match a --org value against id, slug, or name (case-insensitive).
export function matchOrganization<T extends OrgChoice>(
	orgs: T[],
	needle: string,
): T | undefined {
	const n = needle.trim().toLowerCase();
	return orgs.find(
		(o) =>
			o.id.toLowerCase() === n ||
			o.slug.toLowerCase() === n ||
			o.name.toLowerCase() === n,
	);
}

const label = (o: OrgChoice) => `${o.name} (${o.slug})`;

// Resolve which org a command should act on. Never silently guesses when
// ambiguous: with multiple memberships and no usable choice, prompt on a TTY or
// fail with guidance in agent/non-interactive mode. Acting on the wrong org is
// how a host silently lands where it can't be reached.
//
// `activeOrgId` is the caller's stored active org. Observe/manage commands pass
// it so they default to it (matching prior behavior); `start` omits it so
// registration is always an explicit choice.
export async function resolveOrganization<T extends OrgChoice>(
	orgs: T[],
	orgOption: string | undefined,
	activeOrgId?: string,
): Promise<T> {
	if (orgs.length === 0) {
		throw new CLIError("No organizations", "Run: superset auth login");
	}

	if (orgOption) {
		const match = matchOrganization(orgs, orgOption);
		if (!match) {
			throw new CLIError(
				`No organization matches "${orgOption}"`,
				`Available: ${orgs.map(label).join(", ")}`,
			);
		}
		return match;
	}

	const [first] = orgs;
	if (orgs.length === 1 && first) return first;

	if (activeOrgId) {
		const active = orgs.find((o) => o.id === activeOrgId);
		if (active) return active;
	}

	if (isAgentMode() || !process.stdout.isTTY) {
		throw new CLIError(
			"Multiple organizations — pass --org <id|slug|name>",
			`Available: ${orgs.map(label).join(", ")}`,
		);
	}

	const pickedId = await p.select({
		message: "Which organization?",
		options: orgs.map((o) => ({ value: o.id, label: o.name, hint: o.slug })),
	});
	if (p.isCancel(pickedId)) throw new CLIError("Cancelled");
	// value came from the orgs' own ids, so the match is guaranteed.
	return orgs.find((o) => o.id === pickedId) as T;
}

// Fetch memberships and resolve the org to act on, defaulting to the stored
// active org. Used by observe/manage commands (`hosts list`, `status`, `wake`,
// `set-wake`) so they work headlessly via `--org` when no active org is set.
export async function resolveOrganizationFromContext(
	api: ApiClient,
	activeOrgId: string | undefined,
	orgOption: string | undefined,
): Promise<OrgChoice> {
	const orgs = await api.user.myOrganizations.query();
	return resolveOrganization(orgs, orgOption, activeOrgId);
}
