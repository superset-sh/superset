const MAX_CHAIN_SEGMENTS = 4;
const ELLIPSIS_SEGMENT = "…";

interface DirectoryNode {
	directories: Map<string, DirectoryNode>;
	files: Set<string>;
}

function createNode(): DirectoryNode {
	return { directories: new Map(), files: new Set() };
}

// The tree flattens single-child directory chains into one row and truncates
// every segment at once, so a deep chain renders as a row of "…" stubs.
export function elideDirectoryChains(paths: string[]): Map<string, string> {
	const root = createNode();
	for (const path of paths) {
		const segments = path.split("/");
		const fileName = segments.pop() ?? path;
		let node = root;
		for (const segment of segments) {
			let child = node.directories.get(segment);
			if (!child) {
				child = createNode();
				node.directories.set(segment, child);
			}
			node = child;
		}
		node.files.add(fileName);
	}

	const treePathByPath = new Map<string, string>();
	const visit = (node: DirectoryNode, prefix: string, treePrefix: string) => {
		for (const fileName of node.files) {
			treePathByPath.set(prefix + fileName, treePrefix + fileName);
		}
		for (const [name, child] of node.directories) {
			const chain = [name];
			let end = child;
			while (end.files.size === 0 && end.directories.size === 1) {
				const [[nextName, next]] = end.directories;
				chain.push(nextName);
				end = next;
			}
			const shown =
				chain.length > MAX_CHAIN_SEGMENTS
					? [chain[0], ELLIPSIS_SEGMENT, ...chain.slice(-2)]
					: chain;
			visit(
				end,
				`${prefix}${chain.join("/")}/`,
				`${treePrefix}${shown.join("/")}/`,
			);
		}
	};
	visit(root, "", "");
	return treePathByPath;
}
