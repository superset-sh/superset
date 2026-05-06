import type { InternalTaskContent } from "../types";

export const internalTaskRefactorAuth: InternalTaskContent = {
	id: "TASK-42",
	slug: "refactor-auth",
	title: "Refactor auth middleware",
	description:
		"Split session-token storage from request handling so we can encrypt at rest.",
};
