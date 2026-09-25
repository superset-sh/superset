import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { toast } from "@superset/ui/sonner";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { useDashboardSidebarPortKill } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortKill";
import type { DashboardSidebarPortGroup } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useDashboardSidebarPortsData";
import { STROKE_WIDTH } from "renderer/screens/main/components/WorkspaceSidebar/constants";

interface TopBarPortsFooterProps {
	groups: DashboardSidebarPortGroup[];
	totalPortCount: number;
}

/** Dropdown footer: live-port total plus close-all across every workspace. */
export function TopBarPortsFooter({
	groups,
	totalPortCount,
}: TopBarPortsFooterProps) {
	const { t } = useLingui();
	const { isPending, killPorts } = useDashboardSidebarPortKill();

	const handleCloseAll = async () => {
		if (isPending) return;
		const results = await killPorts(groups.flatMap((group) => group.ports));
		const closedCount = results.filter((result) => result.success).length;
		if (closedCount > 0) {
			toast.success(
				t({
					message: plural(closedCount, {
						one: "Closed # port",
						other: "Closed # ports",
					}),
				}),
			);
		}
	};

	return (
		<div className="flex items-center justify-between border-border border-t px-3 py-1.5">
			<span className="text-[11px] text-muted-foreground">
				{t({
					message: plural(totalPortCount, {
						one: "# live port",
						other: "# live ports",
					}),
				})}
			</span>
			<button
				type="button"
				onClick={() => void handleCloseAll()}
				disabled={isPending}
				aria-busy={isPending}
				className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:pointer-events-none disabled:opacity-60"
			>
				{isPending ? (
					<LuLoaderCircle
						className="size-3 animate-spin"
						strokeWidth={STROKE_WIDTH}
					/>
				) : (
					<LuX className="size-3" strokeWidth={STROKE_WIDTH} />
				)}
				<Trans>Close all</Trans>
			</button>
		</div>
	);
}
