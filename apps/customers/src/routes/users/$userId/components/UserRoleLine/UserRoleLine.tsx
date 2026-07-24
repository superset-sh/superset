import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuBriefcase, LuLoaderCircle, LuSparkles } from "react-icons/lu";

import { SocialLinks } from "@/components/SocialLinks";
import { useTRPC } from "@/trpc/react";

export interface UserRoleLineProps {
	userId: string;
}

/**
 * Job title + public social profiles researched by AI, cached 30 days.
 * Cached results always render; fresh research runs automatically when the
 * user's domain is set to auto-research, otherwise only on click.
 */
export function UserRoleLine({ userId }: UserRoleLineProps) {
	const trpc = useTRPC();
	const [requested, setRequested] = useState(false);
	const researchActive = requested;

	const cachedResult = useQuery(
		trpc.customers.userRoleEnrichmentCached.queryOptions(
			{ userId },
			{ staleTime: 60_000, retry: false },
		),
	);
	const research = useQuery(
		trpc.customers.userRoleEnrichment.queryOptions(
			{ userId },
			{
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
				enabled: researchActive,
			},
		),
	);

	const data = research.data ?? cachedResult.data ?? null;
	const isResearching = researchActive && research.isLoading && !data;

	if (isResearching || cachedResult.isLoading) {
		return (
			<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
				<LuLoaderCircle className="size-3.5 animate-spin" />
				{isResearching ? "Researching role & profiles on the web…" : "Loading…"}
			</p>
		);
	}

	const hasAnything =
		data &&
		(data.title ||
			data.linkedinUrl ||
			data.twitterUrl ||
			data.githubUrl ||
			data.websiteUrl);

	if (!data && !research.error) {
		return (
			<Button variant="outline" size="sm" onClick={() => setRequested(true)}>
				<LuSparkles />
				Research role & socials
			</Button>
		);
	}

	if (research.error || !hasAnything) {
		return (
			<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
				<LuBriefcase className="size-3.5" />
				Role unknown
			</p>
		);
	}

	return (
		<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
			<span className="flex items-center gap-1.5">
				<LuBriefcase className="text-muted-foreground size-3.5" />
				{data.title ?? "Role unknown"}
			</span>
			{data.seniority && <Badge variant="outline">{data.seniority}</Badge>}
			{data.location && (
				<span className="text-muted-foreground">{data.location}</span>
			)}
			<SocialLinks
				linkedinUrl={data.linkedinUrl}
				twitterUrl={data.twitterUrl}
				githubUrl={data.githubUrl}
				websiteUrl={data.websiteUrl}
			/>
			<span className="text-muted-foreground text-xs">
				AI-researched · {data.confidence} confidence
			</span>
		</div>
	);
}
