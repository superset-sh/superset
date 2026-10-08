import type { PageLink, PageLinkFinder } from "../../../../utils/pageLinks";

/** For each block, the pages it is the first to link. */
export function pageLinksByBlock(
	blocks: readonly string[],
	alreadyShown: readonly string[],
	findPageLinks: PageLinkFinder,
): PageLink[][] {
	const shown = new Set(alreadyShown);
	return blocks.map((block) =>
		findPageLinks(block).filter((link) => {
			if (shown.has(link.slug)) return false;
			shown.add(link.slug);
			return true;
		}),
	);
}
