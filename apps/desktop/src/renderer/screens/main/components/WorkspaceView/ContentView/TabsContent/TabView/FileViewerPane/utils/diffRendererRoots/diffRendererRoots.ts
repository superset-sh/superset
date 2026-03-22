import { DIFFS_TAG_NAME } from "@pierre/diffs";

export function getDiffShadowRoots(container: HTMLElement): ShadowRoot[] {
	return Array.from(container.querySelectorAll<HTMLElement>(DIFFS_TAG_NAME))
		.map((diffContainer) => diffContainer.shadowRoot)
		.filter((shadowRoot): shadowRoot is ShadowRoot => shadowRoot !== null);
}

export function getDiffSearchRoots(
	container: HTMLElement,
): Array<Node & ParentNode> {
	const searchRoots: Array<Node & ParentNode> = [];

	for (const shadowRoot of getDiffShadowRoots(container)) {
		const contentColumns = Array.from(
			shadowRoot.querySelectorAll<HTMLElement>("[data-column-content]"),
		);

		if (contentColumns.length === 0) {
			searchRoots.push(shadowRoot);
			continue;
		}

		searchRoots.push(...contentColumns);
	}

	return searchRoots;
}
