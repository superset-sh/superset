import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@superset/ui/card";
import { Skeleton } from "@superset/ui/skeleton";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { useState } from "react";
import { LuGlobe, LuSparkles } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
	return (
		<div className="flex items-center justify-between gap-4 text-sm">
			<span className="text-muted-foreground shrink-0">{label}</span>
			<span className="text-right">{value ?? "—"}</span>
		</div>
	);
}

export interface CompanyInfoCardProps {
	domain: string;
	autoResearch: boolean;
}

/**
 * Firmographics researched with AI, cached 30 days. Cached results always
 * render; fresh research runs automatically when the domain is set to
 * auto-research, otherwise only on click.
 */
export function CompanyInfoCard({
	domain,
	autoResearch,
}: CompanyInfoCardProps) {
	const trpc = useTRPC();
	const [requested, setRequested] = useState(false);
	const researchActive = requested || autoResearch;

	const cachedResult = useQuery(
		trpc.customers.domainEnrichmentCached.queryOptions(
			{ domain },
			{ staleTime: 60_000, retry: false },
		),
	);
	const research = useQuery(
		trpc.customers.domainEnrichment.queryOptions(
			{ domain },
			{
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
				enabled: researchActive,
			},
		),
	);

	const data = research.data ?? cachedResult.data ?? null;
	const isResearching = researchActive && research.isLoading && !data;
	const isEmpty =
		data &&
		!data.companyName &&
		!data.description &&
		!data.employeeRange &&
		!data.stage;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<LuGlobe className="text-muted-foreground size-4" />
					{data?.companyName ?? "Company"}
				</CardTitle>
				<CardDescription>
					{data
						? `AI-researched · ${data.confidence} confidence · ${formatDistanceToNow(new Date(data.fetchedAt), { addSuffix: true })}`
						: isResearching
							? "Researching on the web — first run takes ~30s"
							: "Firmographics researched with AI, on demand"}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-2">
				{data ? (
					isEmpty ? (
						<p className="text-muted-foreground text-sm">
							Couldn't identify a company behind this domain.
						</p>
					) : (
						<>
							{data.description && (
								<p className="pb-1 text-sm">{data.description}</p>
							)}
							<Row label="Employees" value={data.employeeRange} />
							<Row
								label="Stage"
								value={
									data.stage ? (
										<Badge variant="outline">{data.stage}</Badge>
									) : null
								}
							/>
							<Row label="Industry" value={data.industry} />
							<Row label="HQ" value={data.headquarters} />
							{data.sources.length > 0 && (
								<p className="text-muted-foreground pt-1 text-xs">
									Sources:{" "}
									{data.sources.slice(0, 3).map((source, index) => (
										<a
											key={source}
											href={source}
											target="_blank"
											rel="noreferrer"
											className="hover:text-foreground underline"
										>
											[{index + 1}]{" "}
										</a>
									))}
								</p>
							)}
						</>
					)
				) : isResearching || cachedResult.isLoading ? (
					<>
						<Skeleton className="h-4 w-full" />
						<Skeleton className="h-4 w-3/4" />
						<Skeleton className="h-4 w-1/2" />
					</>
				) : research.error ? (
					<p className="text-muted-foreground text-sm">
						Research failed — {research.error.message}
					</p>
				) : (
					<Button
						variant="outline"
						size="sm"
						onClick={() => setRequested(true)}
					>
						<LuSparkles />
						Research company
					</Button>
				)}
			</CardContent>
		</Card>
	);
}
