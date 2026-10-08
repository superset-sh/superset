export const LOCAL_PATH_PREFIX = "/__superset_local_path__/";

const BROWSER_SCHEME = /^(https?|mailto|tel):/i;

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
		!BROWSER_SCHEME.test(node.url)
	) {
		node.url = LOCAL_PATH_PREFIX + encodeURIComponent(node.url);
	}
	for (const child of node.children ?? []) rewriteLocalPaths(child);
}

export function remarkLocalPathLinks() {
	return (tree: MarkdownNode) => rewriteLocalPaths(tree);
}
