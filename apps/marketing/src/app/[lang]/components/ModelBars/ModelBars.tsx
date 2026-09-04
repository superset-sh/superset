import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { formatCount, formatTokens, formatUsd } from "../../utils/formatUsage";

const PALETTE = [
	"#d25611",
	"#6b8ca3",
	"#7a9e7e",
	"#c19a5b",
	"#9d7b9e",
	"#5f8a8a",
	"#b07d6a",
	"#8a8a9e",
	"#a3906b",
	"#6e6e78",
];

export type ModelColors = Map<string, string>;

export function modelKey(provider: string, model: string): string {
	return `${provider}/${model}`;
}

export function buildModelColors(
	lists: Array<Array<{ provider: string; model: string }>>,
): ModelColors {
	const colors: ModelColors = new Map();
	for (const list of lists) {
		for (const entry of list) {
			const key = modelKey(entry.provider, entry.model);
			if (!colors.has(key)) {
				colors.set(key, PALETTE[colors.size % PALETTE.length] as string);
			}
		}
	}
	return colors;
}

export interface ModelBarRow {
	provider: string;
	model: string;
	value: number;
	display: string;
}

export function ModelBars({
	rows,
	colors,
}: {
	rows: ModelBarRow[];
	colors?: ModelColors;
}) {
	if (rows.length === 0) {
		return (
			<p className="text-sm text-muted-foreground">
				<Trans>No usage in this range.</Trans>
			</p>
		);
	}

	const max = Math.max(...rows.map((row) => row.value));

	return (
		<div className="space-y-3">
			{rows.map((row, index) => {
				const color =
					colors?.get(modelKey(row.provider, row.model)) ??
					(PALETTE[index % PALETTE.length] as string);
				return (
					<div key={modelKey(row.provider, row.model)}>
						<div className="flex items-baseline justify-between gap-4 mb-1.5">
							<span className="flex items-center gap-2 min-w-0">
								<span
									className="size-2 shrink-0 rounded-[1px]"
									style={{ backgroundColor: color }}
								/>
								<span className="font-mono text-xs text-foreground truncate">
									{row.model}
								</span>
							</span>
							<span className="font-mono text-xs text-muted-foreground shrink-0">
								{row.display}
							</span>
						</div>
						<div className="h-1 bg-foreground/[0.06] rounded-full overflow-hidden">
							<div
								className="h-full"
								style={{
									width: `${max > 0 ? (row.value / max) * 100 : 0}%`,
									backgroundColor: color,
								}}
							/>
						</div>
					</div>
				);
			})}
		</div>
	);
}

export function toUserRows(
	models: Array<{ provider: string; model: string; users: number }>,
): ModelBarRow[] {
	return models.map((model) => ({
		provider: model.provider,
		model: model.model,
		value: model.users,
		display: i18n._({
			...msg({
				message: "{formatted} {count, plural, one {dev} other {devs}}",
			}),
			values: { formatted: formatCount(model.users), count: model.users },
		}),
	}));
}

export function toSpendRows(
	models: Array<{
		provider: string;
		model: string;
		usd: string;
		tokens: number;
	}>,
): ModelBarRow[] {
	return models.map((model) => ({
		provider: model.provider,
		model: model.model,
		value: Number.parseFloat(model.usd) || 0,
		display: formatUsd(model.usd),
	}));
}

export function toTokenRows(
	models: Array<{
		provider: string;
		model: string;
		usd: string;
		tokens: number;
	}>,
): ModelBarRow[] {
	return models.map((model) => ({
		provider: model.provider,
		model: model.model,
		value: model.tokens,
		display: formatTokens(model.tokens),
	}));
}
