"use client";

import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useQuery } from "@tanstack/react-query";

import { useTRPC } from "@/trpc/react";

import { formatMonth } from "../../utils/chartAxis";
import { CohortGrid, type CohortRow } from "../CohortGrid";
import { InsightTileFrame } from "../InsightTileFrame";

// Cohort survival from Neon subscriptions: rows are signup months, columns
// are months since subscribing, cells are % still subscribed. Shares the
// cohort-triangle rendering with weekly retention.
export function ChurnHeatmapTile() {
	const { t, i18n } = useLingui();
	const trpc = useTRPC();
	const query = useQuery(
		trpc.business.getChurnCohorts.queryOptions({ months: 7 }),
	);

	const data = query.data ?? [];
	const cohortMonths = [...new Set(data.map((row) => row.cohort_month))];
	const offsets = [...new Set(data.map((row) => row.month_offset))].sort(
		(a, b) => a - b,
	);
	const byCell = new Map(
		data.map((row) => [`${row.cohort_month}:${row.month_offset}`, row]),
	);

	const rows: CohortRow[] = cohortMonths.map((cohort) => ({
		key: cohort,
		label: formatMonth(cohort),
		size: byCell.get(`${cohort}:0`)?.cohort_size ?? 0,
		cells: offsets.map((offset) => {
			const cell = byCell.get(`${cohort}:${offset}`);
			return cell
				? { pct: cell.surviving_pct, state: "complete" as const }
				: { pct: null, state: "future" as const };
		}),
	}));

	return (
		<InsightTileFrame
			title={t({
				message: "Paid churn — cohort survival",
			})}
			description={t({
				message:
					"% of subscriptions started each month still active k months later (Neon, enterprise excluded)",
			})}
			isLoading={query.isLoading}
			error={query.error}
			empty={data.length === 0}
		>
			<CohortGrid
				columnLabels={offsets.map((offset) =>
					// Not a template literal: the React Compiler hoists one out
					// before the Lingui plugin runs, and every column then reads as
					// the message's hash id.
					i18n._({ ...msg({ message: "Month {offset}" }), values: { offset } }),
				)}
				rows={rows}
				labelHeader={t({
					message: "Cohort",
				})}
				sizeHeader={t({ message: "Subs" })}
			/>
		</InsightTileFrame>
	);
}
