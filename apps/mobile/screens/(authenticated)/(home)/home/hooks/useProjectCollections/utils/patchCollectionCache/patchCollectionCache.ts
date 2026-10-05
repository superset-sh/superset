import { DERIVED_PROJECT_COLLECTION_TAB_ORDER_BASE } from "@superset/shared/project-collections";

export function withProjectTags<Row extends { id: string; tags?: string[] }>(
	rows: Row[] | undefined,
	projectId: string,
	tags: string[],
): Row[] | undefined {
	return rows?.map((row) => (row.id === projectId ? { ...row, tags } : row));
}

export function withCollectionSetting<
	Setting extends { scope: string; tag: string },
>(settings: Setting[] | undefined, setting: Setting): Setting[] {
	return [
		...(settings ?? []).filter(
			(row) => row.scope !== setting.scope || row.tag !== setting.tag,
		),
		setting,
	];
}

export function nextCollectionTabOrder(
	settings: readonly { tabOrder: number | null }[],
): number {
	return (
		Math.max(
			DERIVED_PROJECT_COLLECTION_TAB_ORDER_BASE,
			...settings.map((row) => row.tabOrder ?? 0),
		) + 1
	);
}
