const UPDATE_KEY_NOT_FOUND_PATTERN =
	/was passed to update but an object for this key was not found in the collection/;

export type OptimisticScope =
	| "optimistic.tasks"
	| "optimistic.v2Projects"
	| "optimistic.v2Workspaces"
	| "optimistic.chatSessions"
	| "optimistic.v2UsersHosts"
	| "optimistic.v2Hosts"
	| (string & {});

export function isMissingCollectionKeyError(error: unknown): boolean {
	return (
		error instanceof Error && UPDATE_KEY_NOT_FOUND_PATTERN.test(error.message)
	);
}

function rawErrorMessage(error: unknown): string {
	if (error instanceof Error && error.message.trim()) {
		return error.message;
	}

	if (typeof error === "string" && error.trim()) {
		return error;
	}

	return "The local change was rolled back.";
}

function missingKeyMessage(scope: OptimisticScope): string {
	switch (scope) {
		case "optimistic.v2Workspaces":
			return "This workspace no longer exists. It may have been removed elsewhere.";
		case "optimistic.v2Projects":
			return "This project no longer exists. It may have been removed elsewhere.";
		case "optimistic.tasks":
			return "This task no longer exists. It may have been removed elsewhere.";
		case "optimistic.chatSessions":
			return "This chat session no longer exists. It may have been removed elsewhere.";
		case "optimistic.v2UsersHosts":
			return "This member is no longer part of the host.";
		case "optimistic.v2Hosts":
			return "This host no longer exists. It may have been removed elsewhere.";
		default:
			return "This item no longer exists. It may have been removed elsewhere.";
	}
}

export function describeOptimisticError(
	scope: OptimisticScope,
	error: unknown,
): string {
	if (isMissingCollectionKeyError(error)) {
		return missingKeyMessage(scope);
	}

	return rawErrorMessage(error);
}
