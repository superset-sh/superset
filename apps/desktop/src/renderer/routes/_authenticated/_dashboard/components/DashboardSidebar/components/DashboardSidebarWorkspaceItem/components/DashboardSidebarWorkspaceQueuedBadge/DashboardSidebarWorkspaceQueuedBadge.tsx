import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { ListEnd } from "lucide-react";
import { useMemo } from "react";
import { useSidebarWorkspaceStatus } from "../../../../providers/DashboardSidebarWorkspaceStatusProvider";

export function DashboardSidebarWorkspaceQueuedBadge({
	workspaceId,
}: {
	workspaceId: string;
}) {
	const { t } = useLingui();
	const { bindings } = useSidebarWorkspaceStatus(workspaceId);
	const queued = useMemo(() => {
		let total = 0;
		for (const binding of bindings.values())
			total += binding.queuedPrompts ?? 0;
		return total;
	}, [bindings]);

	if (queued === 0) return null;
	const label = t({
		message: plural(queued, {
			one: "# message waiting in the queue",
			other: "# messages waiting in the queue",
		}),
	});
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span className="flex h-5 shrink-0 items-center gap-0.5 font-mono text-[10px] tabular-nums text-amber-500/90 group-hover:hidden group-focus-within:hidden">
					<ListEnd aria-hidden="true" className="size-3" />
					<span aria-hidden="true">{queued}</span>
					<span className="sr-only">{label}</span>
				</span>
			</TooltipTrigger>
			<TooltipContent side="right">{label}</TooltipContent>
		</Tooltip>
	);
}
