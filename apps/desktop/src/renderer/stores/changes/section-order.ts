import type { ChangeCategory } from "shared/changes-types";

export const DEFAULT_CHANGE_SECTION_ORDER: ChangeCategory[] = [
	"against-base",
	"committed",
	"staged",
	"unstaged",
];

export function normalizeChangeSectionOrder(
	sectionOrder: ChangeCategory[] | undefined,
): ChangeCategory[] {
	if (!sectionOrder || sectionOrder.length === 0) {
		return [...DEFAULT_CHANGE_SECTION_ORDER];
	}

	const validSections = new Set(DEFAULT_CHANGE_SECTION_ORDER);
	const seen = new Set<ChangeCategory>();
	const normalized: ChangeCategory[] = [];

	for (const section of sectionOrder) {
		if (!validSections.has(section)) continue;
		if (seen.has(section)) continue;
		seen.add(section);
		normalized.push(section);
	}

	for (const section of DEFAULT_CHANGE_SECTION_ORDER) {
		if (seen.has(section)) continue;
		normalized.push(section);
	}

	return normalized;
}

export function getOrderedChangeSectionIds(
	sectionOrder: ChangeCategory[] | undefined,
): ChangeCategory[] {
	return normalizeChangeSectionOrder(sectionOrder);
}
