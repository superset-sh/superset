import { Trans, useLingui } from "@lingui/react/macro";
import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import { HighlightText } from "renderer/routes/_authenticated/settings/components/HighlightText";
import { useSettings } from "renderer/stores/settings";
import { useSettingsSearchQuery } from "renderer/stores/settings-state";

export function ReadingWidthSetting() {
	const { t } = useLingui();
	const searchQuery = useSettingsSearchQuery();
	const enabled = useSettings((state) => state.terminalReadingWidth);
	const update = useSettings((state) => state.update);

	return (
		<div className="flex items-center justify-between gap-10">
			<div className="space-y-1">
				<Label htmlFor="terminal-reading-width" className="text-sm font-medium">
					<HighlightText
						text={t({ message: "Reading width" })}
						query={searchQuery}
					/>
				</Label>
				<p className="text-xs text-muted-foreground max-w-md leading-relaxed">
					<Trans>
						Center terminal content in a narrower column for easier reading
					</Trans>
				</p>
			</div>
			<Switch
				id="terminal-reading-width"
				checked={enabled}
				onCheckedChange={(checked) => update("terminalReadingWidth", checked)}
				className="shrink-0"
			/>
		</div>
	);
}
