export const LOCAL_PATH_PREFIX = "/__superset_local_path__/";

const URL_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d+(?::\d+)?$)/i;

interface MarkdownNode {
	type: string;
	url?: string;
	children?: MarkdownNode[];
}

function rewriteLocalPaths(node: MarkdownNode) {
	if (
		node.type === "link" &&
		node.url &&
		!node.url.startsWith("#") &&
		(node.url.startsWith("file://") || !URL_SCHEME.test(node.url))
	) {
		node.url = LOCAL_PATH_PREFIX + encodeURIComponent(node.url);
	}
	for (const child of node.children ?? []) rewriteLocalPaths(child);
}

export function remarkLocalPathLinks() {
	return (tree: MarkdownNode) => rewriteLocalPaths(tree);
}
