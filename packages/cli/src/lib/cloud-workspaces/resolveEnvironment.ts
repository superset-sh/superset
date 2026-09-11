import { CLIError } from "@superset/cli-framework";
import {
	type SelectableEnvironment,
	selectCloudEnvironment,
} from "@superset/shared/cloud-environments";

/**
 * Environments are created in the desktop app, so a miss lists what exists —
 * a terminal has no other way to see the set it just missed.
 */
export function resolveCloudEnvironment<T extends SelectableEnvironment>(
	environments: T[],
	requested: string | undefined,
): T {
	if (environments.length === 0) {
		throw new CLIError(
			"No environments in this organization",
			"Add one in Settings → Environments before creating a cloud workspace",
		);
	}

	const selected = selectCloudEnvironment(environments, requested);
	if (!selected) {
		throw new CLIError(
			`No environment "${requested}" in this organization`,
			`Available: ${environments.map((environment) => environment.name).join(", ")}`,
		);
	}
	return selected;
}
