import { CLIError } from "@superset/cli-framework";
import {
	describeEnvironments,
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
			"Create one with: superset environments create",
		);
	}

	const selected = selectCloudEnvironment(environments, requested);
	if (!selected || !startable.includes(selected)) {
		throw new CLIError(
			selected
				? `Environment "${selected.name}" has no repositories`
				: requested === undefined
					? "Several environments in this organization; pass --environment"
					: `No environment ${requested} in this organization`,
			`Start from one of: ${describeEnvironments(startable)}`,
		);
	}
	return selected;
}
