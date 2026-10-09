import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuRotateCcw } from "react-icons/lu";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { StatusIndicator } from "renderer/screens/main/components/StatusIndicator";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";
import {
	DEFAULT_STATUS_COLORS,
	useStatusColorsStore,
} from "renderer/stores/status-colors";
import type { ActivePaneStatus } from "shared/tabs-types";

const STATUS_ORDER: ActivePaneStatus[] = [
	"working",
	"permission",
	"failed",
	"review",
];

export function StatusColorsSection() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const overrides = useStatusColorsStore((state) => state.overrides);
	const setStatusColor = useStatusColorsStore((state) => state.setStatusColor);
	const resetStatusColor = useStatusColorsStore(
		(state) => state.resetStatusColor,
	);
	const resetAllStatusColors = useStatusColorsStore(
		(state) => state.resetAllStatusColors,
	);
	const hasOverrides = Object.keys(overrides).length > 0;

	const statusLabels: Record<ActivePaneStatus, string> = {
		working: t({ message: "Working" }),
		permission: t({ message: "Needs input" }),
		failed: t({ message: "Failed" }),
		review: t({ message: "Ready for review" }),
	};

	return (
		<div className="space-y-3 p-4">
			<div className="flex items-center justify-between gap-6">
				<div className="min-w-0 flex-1">
					<div className="text-sm font-medium">
						<HighlightText
							text={t({ message: "Status colors" })}
							query={searchQuery}
						/>
					</div>
					<div className="text-xs text-muted-foreground">
						<HighlightText
							text={t({
								message:
									"Colors of the dots that show agent status on workspaces, tabs and agents.",
							})}
							query={searchQuery}
						/>
					</div>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					onClick={resetAllStatusColors}
					disabled={!hasOverrides}
				>
					<Trans>Reset to defaults</Trans>
				</Button>
			</div>
			<div className="grid grid-cols-2 gap-2">
				{STATUS_ORDER.map((status) => {
					const override = overrides[status];
					const label = statusLabels[status];
					return (
						<div
							key={status}
							className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
						>
							<StatusIndicator status={status} className="size-2" />
							<span className="min-w-0 flex-1 truncate text-sm">{label}</span>
							<input
								type="color"
								value={override ?? DEFAULT_STATUS_COLORS[status]}
								onChange={(event) => setStatusColor(status, event.target.value)}
								aria-label={t({ message: `${label} color` })}
								className="h-6 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
							/>
							<Button
								type="button"
								variant="ghost"
								size="icon-xs"
								onClick={() => resetStatusColor(status)}
								disabled={!override}
								aria-label={t({ message: `Reset ${label} color` })}
								title={t({ message: "Reset to default" })}
							>
								<LuRotateCcw className="size-3.5" />
							</Button>
						</div>
					);
				})}
			</div>
		</div>
	);
}
