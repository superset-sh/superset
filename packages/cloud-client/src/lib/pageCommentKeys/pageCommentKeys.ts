export const pageCommentKeys = {
	all: ["cloud", "pageComment"] as const,
	list: (pageId: string) => ["cloud", "pageComment", "list", pageId] as const,
};
