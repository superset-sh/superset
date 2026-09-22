import { CLIError } from "@superset/cli-framework";
import {
	type SelectableEnvironment,
	selectCloudEnvironment,
	startableCloudEnvironments,
} from "@superset/shared/cloud-environments";

/**
 * Environments are created in the desktop app, so a miss lists what exists —
 * a terminal has no other way to see the set it just missed.
 */
export function resolveCloudEnvironment<T extends SelectableEnvironment>(
	environments: T[],
	requested: string | undefined,
): T {
	const startable = startableCloudEnvironments(environments);
	if (startable.length === 0) {
		throw new CLIError(
			"No environment with repositories in this organization",
			"Create one in Settings → Environments before creating a cloud workspace",
		);
	}

	const selected = selectCloudEnvironment(environments, requested);
	if (!selected || !startable.includes(selected)) {
		throw new CLIError(
			selected
				? `Environment "${selected.name}" has no repositories`
				: `No environment "${requested}" in this organization`,
			`Start from one with repositories: ${startable.map((environment) => environment.name).join(", ")}`,
		);
	}
	return selected;
}
