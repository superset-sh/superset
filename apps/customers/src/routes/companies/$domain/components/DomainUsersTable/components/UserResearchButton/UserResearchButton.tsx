import { Button } from "@superset/ui/button";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LuLoaderCircle, LuSparkles } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

export interface UserResearchButtonProps {
	userId: string;
	/** Domain page to refresh once research lands, so the row fills in. */
	domain: string;
}

/** Inline per-user research trigger for un-researched rows (~2s via Exa). */
export function UserResearchButton({
	userId,
	domain,
}: UserResearchButtonProps) {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const [requested, setRequested] = useState(false);

	const research = useQuery(
		trpc.customers.userRoleEnrichment.queryOptions(
			{ userId },
			{
				staleTime: Number.POSITIVE_INFINITY,
				retry: false,
				enabled: requested,
			},
		),
	);

	// Refresh the table row once the result lands.
	const done = research.data != null;
	useEffect(() => {
		if (done) {
			queryClient.invalidateQueries({
				queryKey: trpc.customers.domainDetail.queryKey({ domain }),
			});
		}
	}, [done, queryClient, trpc, domain]);

	if (requested && research.isLoading) {
		return (
			<span className="text-muted-foreground flex items-center gap-1.5 text-xs">
				<LuLoaderCircle className="size-3 animate-spin" />
				researching…
			</span>
		);
	}

	if (research.error) {
		return (
			<span className="text-muted-foreground text-xs">research failed</span>
		);
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			className="text-muted-foreground h-6 w-fit px-1.5 text-xs"
			onClick={() => setRequested(true)}
		>
			<LuSparkles className="size-3" />
			Research
		</Button>
	);
}
