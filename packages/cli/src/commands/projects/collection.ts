import { CLIError } from "@superset/cli-framework";
import {
	normalizeWorkspaceTag,
	PROJECTS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";

export type ProjectCollectionSetting = {
	scope: string;
	tag: string;
	displayName: string | null;
};

export function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/no procedure found|procedure .* not found on server/i.test(error.message)
	);
}

export function validateProjectCollectionName(value: string): string {
	const name = value.trim();
	if (!name || name.length > 200) {
		throw new CLIError(
			"Invalid --collection value",
			"Collection names are 1-200 characters after trimming",
		);
	}
	return name;
}

export function resolveProjectCollectionName(
	value: string,
	settings: readonly ProjectCollectionSetting[],
): string {
	const name = validateProjectCollectionName(value);
	const setting = settings.find(
		(candidate) =>
			candidate.scope === PROJECTS_TAG_SCOPE &&
			candidate.displayName?.trim().toLowerCase() === name.toLowerCase(),
	);
	if (setting) return setting.tag;

	const tag = normalizeWorkspaceTag(name);
	if (tag) return tag;
	throw new CLIError(
		"Invalid --collection value",
		"Use a collection name or a 1-64 character tag",
	);
}

export function collectionDisplayName(
	tags: readonly string[],
	settings: readonly ProjectCollectionSetting[],
): string | null {
	const settingByTag = new Map(
		settings
			.filter((setting) => setting.scope === PROJECTS_TAG_SCOPE)
			.map((setting) => [setting.tag, setting.displayName ?? setting.tag]),
	);
	return tags.map((tag) => settingByTag.get(tag) ?? tag)[0] ?? null;
}

export function projectCollectionsUnavailable(): CLIError {
	return new CLIError(
		"This host does not support project collections",
		"Update the host service, then retry the command",
	);
}
