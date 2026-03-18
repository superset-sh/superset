import type { ModelOption } from "../../../../types";

export function groupModelsByProvider(
	models: ModelOption[],
): Array<[string, ModelOption[]]> {
	const groups = new Map<string, ModelOption[]>();

	for (const model of models) {
		const existingGroup = groups.get(model.provider);
		if (existingGroup) {
			existingGroup.push(model);
			continue;
		}
		groups.set(model.provider, [model]);
	}

	return Array.from(groups.entries());
}
