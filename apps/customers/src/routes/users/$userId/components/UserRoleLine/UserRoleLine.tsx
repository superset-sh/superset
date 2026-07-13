import { Badge } from "@superset/ui/badge";
import { Button } from "@superset/ui/button";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { IconType } from "react-icons";
import {
	LuBriefcase,
	LuGithub,
	LuGlobe,
	LuLinkedin,
	LuLoaderCircle,
	LuSparkles,
	LuTwitter,
} from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export interface UserRoleLineProps {
	userId: string;
	/** Domain-level setting: research automatically instead of on click. */
	autoResearch: boolean;
}

function SocialLink({
	href,
	label,
	icon: Icon,
}: {
	href: string;
	label: string;
	icon: IconType;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			aria-label={label}
			title={label}
			className="text-muted-foreground hover:text-foreground flex items-center gap-1"
		>
			<Icon className="size-3.5" />
		</a>
	);
}

/**
 * Job title + public social profiles researched by AI, cached 30 days.
 * Cached results always render; fresh research runs automatically when the
 * user's domain is set to auto-research, otherwise only on click.
 */
export function UserRoleLine({ userId, autoResearch }: UserRoleLineProps) {
	const trpc = useTRPC();
	const [requested, setRequested] = useState(false);
	const researchActive = requested || autoResearch;

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
			<span className="flex items-center gap-2">
				{data.linkedinUrl && (
					<SocialLink
						href={data.linkedinUrl}
						label="LinkedIn"
						icon={LuLinkedin}
					/>
				)}
				{data.twitterUrl && (
					<SocialLink
						href={data.twitterUrl}
						label="Twitter / X"
						icon={LuTwitter}
					/>
				)}
				{data.githubUrl && (
					<SocialLink href={data.githubUrl} label="GitHub" icon={LuGithub} />
				)}
				{data.websiteUrl && (
					<SocialLink href={data.websiteUrl} label="Website" icon={LuGlobe} />
				)}
			</span>
			<span className="text-muted-foreground text-xs">
				AI-researched · {data.confidence} confidence
			</span>
		</div>
	);
}
