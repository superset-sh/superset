import { Badge } from "@superset/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { LuBriefcase, LuLoaderCircle } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export interface UserRoleLineProps {
	userId: string;
}

/** Job title researched by Claude + web search, cached 30 days. */
export function UserRoleLine({ userId }: UserRoleLineProps) {
	const trpc = useTRPC();
	const role = useQuery(
		trpc.customers.userRoleEnrichment.queryOptions(
			{ userId },
			{ staleTime: Number.POSITIVE_INFINITY, retry: false },
		),
	);

	if (role.isLoading) {
		return (
			<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
				<LuLoaderCircle className="size-3.5 animate-spin" />
				Researching role on the web…
			</p>
		);
	}

	if (role.error || !role.data?.title) {
		return (
			<p className="text-muted-foreground flex items-center gap-1.5 text-sm">
				<LuBriefcase className="size-3.5" />
				Role unknown
			</p>
		);
	}

	return (
		<p className="flex items-center gap-2 text-sm">
			<LuBriefcase className="text-muted-foreground size-3.5" />
			<span>{role.data.title}</span>
			{role.data.seniority && (
				<Badge variant="outline">{role.data.seniority}</Badge>
			)}
			{role.data.linkedinUrl && (
				<a
					href={role.data.linkedinUrl}
					target="_blank"
					rel="noreferrer"
					className="text-muted-foreground hover:text-foreground underline"
				>
					LinkedIn
				</a>
			)}
			<span className="text-muted-foreground text-xs">
				AI-researched · {role.data.confidence} confidence
			</span>
		</p>
	);
}
