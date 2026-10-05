export function getModelMix(
	models: ReadonlyArray<{ model: string; tokens: string }>,
) {
	const totals = { claude: 0, gpt: 0, other: 0 };
	for (const { model, tokens } of models) {
		const value = Number(tokens);
		if (!Number.isFinite(value) || value <= 0) continue;
		const family = model.startsWith("claude-")
			? "claude"
			: model.startsWith("gpt-")
				? "gpt"
				: "other";
		totals[family] += value;
	}
	return { ...totals, total: totals.claude + totals.gpt + totals.other };
}
