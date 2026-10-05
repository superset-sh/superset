import {
	normalizeWorkspaceTag,
	PROJECTS_TAG_SCOPE,
} from "@superset/shared/workspace-tags";

type ProjectCollectionSetting = {
	scope: string;
	tag: string;
	displayName: string | null;
};

export type ProjectCollectionCallOptions = {
	relayUrl: string;
	organizationId: string;
	hostId: string;
	jwt: string;
};

export type ProjectCollectionCall = <TOutput>(
	options: ProjectCollectionCallOptions,
	procedure: string,
	method: "query" | "mutation",
	input?: unknown,
) => Promise<TOutput>;

export type ProjectUpdateInput = {
	hostId: string;
	id: string;
	collection: string | null;
};

function isMissingProcedureError(error: unknown): boolean {
	return (
		error instanceof Error &&
		/no procedure found|procedure .* not found on server/i.test(error.message)
	);
}

function projectCollectionsUnavailable(): Error {
	return new Error(
		"This host does not support project collections. Update the host service, then retry.",
	);
}

async function resolveCollectionTag(
	options: ProjectCollectionCallOptions,
	collection: string,
	call: ProjectCollectionCall,
): Promise<string> {
	let settings: ProjectCollectionSetting[];
	try {
		settings = await call<ProjectCollectionSetting[]>(
			options,
			"tagFolders.list",
			"query",
		);
	} catch (error) {
		if (isMissingProcedureError(error)) throw projectCollectionsUnavailable();
		throw error;
	}
	const setting = settings.find(
		(candidate) =>
			candidate.scope === PROJECTS_TAG_SCOPE &&
			candidate.displayName?.trim().toLowerCase() === collection.toLowerCase(),
	);
	const tag = setting?.tag ?? normalizeWorkspaceTag(collection);
	if (tag) return tag;
	throw new Error("Collection tags must be 1-64 characters after trimming.");
}

export async function updateProjectCollection(
	input: ProjectUpdateInput,
	options: ProjectCollectionCallOptions,
	call: ProjectCollectionCall,
): Promise<unknown> {
	const tags =
		input.collection === null
			? []
			: [await resolveCollectionTag(options, input.collection, call)];
	try {
		return await call(options, "project.setTags", "mutation", {
			projectId: input.id,
			tags,
		});
	} catch (error) {
		if (isMissingProcedureError(error)) throw projectCollectionsUnavailable();
		throw error;
	}
}
