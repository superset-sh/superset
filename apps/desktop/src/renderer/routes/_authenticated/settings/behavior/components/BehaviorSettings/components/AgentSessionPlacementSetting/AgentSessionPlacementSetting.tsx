import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@superset/ui/select";
import {
	setAgentSessionPlacement,
	useAgentSessionPlacement,
} from "renderer/hooks/useAgentSessionPlacement";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";

export function AgentSessionPlacementSetting({
	searchQuery,
}: {
	searchQuery: string;
}) {
	const { t } = useLingui();
	const placement = useAgentSessionPlacement();
	return (
		<div className="flex items-center justify-between gap-6">
			<div className="space-y-0.5">
				<Label
					htmlFor="agent-session-placement"
					className="text-sm font-medium"
				>
					<HighlightText
						text={t({ message: "New agent sessions" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground">
					<Trans>
						Choose where agents started from comments, design mode, and Pages
						open.
					</Trans>
				</p>
			</div>
			<Select value={placement} onValueChange={setAgentSessionPlacement}>
				<SelectTrigger
					id="agent-session-placement"
					className="w-[180px] shrink-0"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="split-pane">
						<Trans>Split pane</Trans>
					</SelectItem>
					<SelectItem value="new-tab">
						<Trans>New tab</Trans>
					</SelectItem>
				</SelectContent>
			</Select>
		</div>
	);
}
