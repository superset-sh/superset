export const CLOUD_QUERY_KEY_ROOT = "cloud";

export const pageCommentKeys = {
	all: [CLOUD_QUERY_KEY_ROOT, "pageComment"] as const,
	list: (pageId: string) =>
		[CLOUD_QUERY_KEY_ROOT, "pageComment", "list", pageId] as const,
};
