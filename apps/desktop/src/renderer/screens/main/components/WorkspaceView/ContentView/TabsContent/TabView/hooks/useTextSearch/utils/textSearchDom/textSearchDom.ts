interface SearchTextNode {
	node: Text;
	start: number;
	end: number;
}

interface SearchRootText {
	text: string;
	textNodes: SearchTextNode[];
}

interface FindTextRangesOptions {
	searchRoots: Array<Node & ParentNode>;
	searchQuery: string;
	caseSensitive: boolean;
}

function collectSearchRootText(searchRoot: Node & ParentNode): SearchRootText {
	const ownerDocument = searchRoot.ownerDocument;
	if (!ownerDocument) {
		return { text: "", textNodes: [] };
	}

	const walker = ownerDocument.createTreeWalker(
		searchRoot,
		NodeFilter.SHOW_TEXT,
	);
	const textNodes: SearchTextNode[] = [];
	let text = "";

	for (
		let node = walker.nextNode() as Text | null;
		node !== null;
		node = walker.nextNode() as Text | null
	) {
		const textContent = node.textContent;
		if (!textContent) {
			continue;
		}

		const start = text.length;
		text += textContent;
		textNodes.push({
			node,
			start,
			end: text.length,
		});
	}

	return { text, textNodes };
}

function findTextNodeIndexForOffset(
	textNodes: SearchTextNode[],
	offset: number,
): number {
	for (let index = 0; index < textNodes.length; index += 1) {
		if (offset < textNodes[index].end) {
			return index;
		}
	}

	return -1;
}

export function findTextRanges({
	searchRoots,
	searchQuery,
	caseSensitive,
}: FindTextRangesOptions): Range[] {
	const normalizedQuery = caseSensitive
		? searchQuery
		: searchQuery.toLowerCase();
	const ranges: Range[] = [];

	for (const searchRoot of searchRoots) {
		const { text, textNodes } = collectSearchRootText(searchRoot);
		if (textNodes.length === 0) {
			continue;
		}

		const searchableText = caseSensitive ? text : text.toLowerCase();
		let startIdx = 0;

		while (startIdx < searchableText.length) {
			const matchStart = searchableText.indexOf(normalizedQuery, startIdx);
			if (matchStart === -1) {
				break;
			}

			const matchEnd = matchStart + searchQuery.length;
			const startNodeIndex = findTextNodeIndexForOffset(textNodes, matchStart);
			const endNodeIndex = findTextNodeIndexForOffset(textNodes, matchEnd - 1);

			if (startNodeIndex === -1 || endNodeIndex === -1) {
				startIdx = matchStart + 1;
				continue;
			}

			const startNode = textNodes[startNodeIndex];
			const endNode = textNodes[endNodeIndex];

			const range = new Range();
			range.setStart(startNode.node, matchStart - startNode.start);
			range.setEnd(endNode.node, matchEnd - endNode.start);
			ranges.push(range);

			startIdx = matchStart + 1;
		}
	}

	return ranges;
}

export function getHighlightStyleContainers(
	searchRoots: Array<Node & ParentNode>,
	document: Document,
): Array<HTMLHeadElement | ShadowRoot> {
	const styleContainers = new Set<HTMLHeadElement | ShadowRoot>();

	for (const root of searchRoots) {
		const rootNode = root.getRootNode();
		if (rootNode instanceof ShadowRoot) {
			styleContainers.add(rootNode);
			continue;
		}

		if (document.head) {
			styleContainers.add(document.head);
		}
	}

	return Array.from(styleContainers);
}
