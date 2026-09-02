"use client";

import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";

// Shared cohort-triangle rendering for retention and survival grids: solid
// chips scaled by percentage, dashed outline while a period is still in
// progress, and nothing at all for periods a cohort hasn't reached.
export type CohortCellState = "complete" | "inProgress" | "future";

export interface CohortCell {
	pct: number | null;
	state: CohortCellState;
}

export interface CohortRow {
	key: string;
	label: string;
	size: number;
	cells: CohortCell[];
	emphasis?: boolean;
}

interface CohortGridProps {
	columnLabels: string[];
	rows: CohortRow[];
	labelHeader?: string;
	sizeHeader?: string;
}

function Cell({ cell, isBaseline }: { cell: CohortCell; isBaseline: boolean }) {
	if (cell.state === "future" || cell.pct === null) {
		return <div />;
	}
	if (cell.state === "inProgress") {
		return (
			<div className="border-border text-muted-foreground rounded-md border border-dashed px-1 py-3 text-center tabular-nums">
				{cell.pct.toFixed(1)}%
			</div>
		);
	}
	return (
		<div
			className={cn(
				"rounded-md px-1 py-3 text-center tabular-nums",
				(isBaseline || cell.pct >= 45) && "text-white",
			)}
			style={{
				background: isBaseline
					? "var(--chart-1)"
					: `color-mix(in oklch, var(--chart-1) ${Math.max(8, Math.round(cell.pct))}%, transparent)`,
			}}
		>
			{cell.pct.toFixed(1)}%
		</div>
	);
}

export function CohortGrid({
	columnLabels,
	rows,
	labelHeader,
	sizeHeader,
}: CohortGridProps) {
	const { t } = useLingui();

	return (
		<div className="overflow-x-auto">
			<div
				className="grid min-w-[860px] items-center gap-1 text-xs"
				style={{
					gridTemplateColumns: `5.5rem 3.5rem repeat(${columnLabels.length}, minmax(3.5rem, 1fr))`,
				}}
			>
				<span className="text-muted-foreground">
					{labelHeader ?? t({ message: "Cohort" })}
				</span>
				<span className="text-muted-foreground pr-3 text-right">
					{sizeHeader ?? t({ message: "Size" })}
				</span>
				{columnLabels.map((label) => (
					<span key={label} className="text-muted-foreground text-center">
						{label}
					</span>
				))}

				{rows.map((row) => [
					<span
						key={`${row.key}-label`}
						className={cn(
							"whitespace-nowrap",
							row.emphasis ? "font-medium" : "text-muted-foreground",
						)}
					>
						{row.label}
					</span>,
					<span
						key={`${row.key}-size`}
						className={cn(
							"pr-3 text-right tabular-nums",
							row.emphasis && "font-medium",
						)}
					>
						{row.size}
					</span>,
					...columnLabels.map((label, index) => (
						<Cell
							key={`${row.key}-${label}`}
							cell={row.cells[index] ?? { pct: null, state: "future" }}
							isBaseline={index === 0}
						/>
					)),
				])}
			</div>
		</div>
	);
}
