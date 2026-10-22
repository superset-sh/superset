import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../api-client";

/** A source by its id or its owner/name, so a script can use either. */
export async function resolveSource(api: ApiClient, ref: string) {
	const sources = await api.plugins.organization.sources.list.query();
	const matches = sources.filter(
		(s) => s.id === ref || s.repo.toLowerCase() === ref.toLowerCase(),
	);
	if (matches.length === 1) return matches[0] as (typeof sources)[number];
	throw new CLIError(
		matches.length
			? `${ref} has more than one source; name it by id.`
			: `No source ${ref}.`,
		"See them: superset plugins organization sources list",
	);
}
