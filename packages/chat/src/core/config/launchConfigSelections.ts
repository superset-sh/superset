import type { SessionConfigOption } from "../../protocol/envelope";

export interface ConfigSelection {
	configId: string;
	value: string;
}

function pick(
	options: SessionConfigOption[],
	category: string,
	label: string | null,
): ConfigSelection | null {
	if (!label) return null;
	const option = options.find((entry) => entry.category === category);
	const wanted = option?.options.find(
		(entry) => entry.label.toLowerCase() === label.toLowerCase(),
	);
	if (!option || !wanted || wanted.id === option.currentValue) return null;
	return { configId: option.id, value: wanted.id };
}

export function launchConfigSelections(
	options: SessionConfigOption[],
	launch: { modelLabel: string | null; effortLabel: string | null },
): ConfigSelection[] {
	return [
		pick(options, "model", launch.modelLabel),
		pick(options, "thought_level", launch.effortLabel),
	].filter((selection): selection is ConfigSelection => selection !== null);
}
