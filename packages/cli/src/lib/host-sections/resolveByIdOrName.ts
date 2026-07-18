import { CLIError } from "@superset/cli-framework";

export const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
	return UUID_RE.test(value);
}

// Resolve one item by UUID or unique case-insensitive name; throws (with the
// caller's hints) on no match or an ambiguous name.
export function resolveByIdOrName<T extends { id: string; name: string }>(
	items: T[],
	nameOrId: string,
	labels: {
		entity: string;
		notFoundHint?: string;
		ambiguousHint?: string;
	},
): T {
	if (isUuid(nameOrId)) {
		// UUIDs are case-insensitive.
		const wantedId = nameOrId.toLowerCase();
		const byId = items.find((item) => item.id.toLowerCase() === wantedId);
		if (!byId) {
			throw new CLIError(
				`${labels.entity} not found: ${nameOrId}`,
				labels.notFoundHint,
			);
		}
		return byId;
	}

	const wanted = nameOrId.toLowerCase();
	const matches = items.filter((item) => item.name.toLowerCase() === wanted);
	const match = matches[0];
	if (!match) {
		throw new CLIError(
			`${labels.entity} not found: ${nameOrId}`,
			labels.notFoundHint,
		);
	}
	if (matches.length > 1) {
		throw new CLIError(
			`${labels.entity} name is ambiguous: ${nameOrId}`,
			labels.ambiguousHint ?? "Pass the id instead",
		);
	}
	return match;
}
