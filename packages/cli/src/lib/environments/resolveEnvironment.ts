import { CLIError } from "@superset/cli-framework";
import type { ApiClient } from "../api-client";

export interface ResolvedEnvironment {
	id: string;
	name: string;
}

/**
 * The environment a command acts on, by id or name. Nothing requested is
 * only unambiguous when the organization has one environment.
 */
export async function resolveEnvironment(
	api: ApiClient,
	organizationId: string,
	requested: string | undefined,
): Promise<ResolvedEnvironment> {
	const environments = await api.environment.list.query({ organizationId });
	if (environments.length === 0) {
		throw new CLIError(
			"No environments in this organization",
			"Create one in Settings → Environments",
		);
	}
	const [only] = environments;
	if (requested === undefined) {
		if (only && environments.length === 1) return only;
		throw new CLIError(
			"Several environments in this organization",
			`Pass --environment with one of: ${environments.map((environment) => environment.name).join(", ")}`,
		);
	}
	const wanted = requested.trim().toLowerCase();
	const selected = environments.find(
		(environment) =>
			environment.id.toLowerCase() === wanted ||
			environment.name.toLowerCase() === wanted,
	);
	if (!selected) {
		throw new CLIError(
			`No environment "${requested}" in this organization`,
			`Environments: ${environments.map((environment) => environment.name).join(", ")}`,
		);
	}
	return selected;
}
