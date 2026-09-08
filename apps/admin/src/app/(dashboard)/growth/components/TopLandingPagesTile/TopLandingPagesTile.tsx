"use client";

import { useLingui } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";
import { COMPANY } from "@superset/shared/constants";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { useTRPC } from "@/trpc/react";

import { InsightTileFrame } from "../../../components/InsightTileFrame";
import { useGrowthRange } from "../../providers/GrowthRangeProvider";
import { PostHogQueryLink } from "../PostHogQueryLink";
import { RankedTable } from "../RankedTable";

const STALE_TIME_MS = 10 * 60 * 1000;
const SCOPES = ["compare", "blog", "docs", "changelog", "all"] as const;
type Scope = (typeof SCOPES)[number];

export function TopLandingPagesTile() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const [scope, setScope] = useState<Scope>("compare");
	const { days } = useGrowthRange();
	const query = useQuery(
		trpc.growth.topLandingPages.queryOptions(
			{ scope, days },
			{ staleTime: STALE_TIME_MS },
		),
	);
	const rows = query.data?.rows ?? [];
	const dayCount = formatNumber(days);
	const baseUrl = scope === "docs" ? COMPANY.DOCS_URL : COMPANY.MARKETING_URL;

	const scopeLabels: Record<Scope, string> = {
		compare: t({ message: "Compare pages" }),
		blog: t({ message: "Blog posts" }),
		docs: t({ message: "Docs" }),
		changelog: t({ message: "Changelog" }),
		all: t({ message: "Whole site" }),
	};

	return (
		<InsightTileFrame
			title={t`Top landing pages, last ${dayCount} days`}
			description={t({
				message:
					"Pages sessions started on, with the share that left without a second page. The compare pages are the SEO surface.",
			})}
			isLoading={query.isLoading}
			error={query.error}
			onRefresh={() => query.refetch()}
			isRefreshing={query.isFetching}
			empty={rows.length === 0}
			fill
			headerAction={
				<>
					<PostHogQueryLink query={query.data?.query} />
					<Select value={scope} onValueChange={(v) => setScope(v as Scope)}>
						<SelectTrigger className="h-7 w-[150px] text-xs">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							{SCOPES.map((s) => (
								<SelectItem key={s} value={s} className="text-xs">
									{scopeLabels[s]}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</>
			}
		>
			<RankedTable
				columns={[
					{ key: "path", label: t({ message: "Page" }) },
					{
						key: "visitors",
						label: t({ message: "Visitors" }),
						align: "right",
					},
					{
						key: "bounce",
						label: t({ message: "Bounce" }),
						align: "right",
					},
				]}
				rows={rows.map((row) => ({
					id: row.path,
					cells: {
						path: (
							<a
								href={`${baseUrl}${row.path}`}
								target="_blank"
								rel="noreferrer"
								className="hover:underline"
							>
								{row.path}
							</a>
						),
						visitors: formatNumber(row.visitors),
						bounce: `${formatNumber(row.bouncePct)}%`,
					},
				}))}
			/>
		</InsightTileFrame>
	);
}
