import { Label } from "@superset/ui/label";
import { Switch } from "@superset/ui/switch";
import {
	useClaudeTabDecorationEnabled,
	useClaudeTabDecorationStore,
} from "renderer/stores/claude-tab-decoration";

export function ClaudeTabDecorationSection() {
	const enabled = useClaudeTabDecorationEnabled();
	const setEnabled = useClaudeTabDecorationStore((state) => state.setEnabled);

	return (
		<div className="flex items-center justify-between gap-6">
			<div className="min-w-0 flex-1 space-y-0.5">
				<Label htmlFor="claude-tab-decoration" className="text-sm font-medium">
					Claude Code session name & color
				</Label>
				<p className="text-xs text-muted-foreground">
					Reflect a Claude Code session's <code>/rename</code> and{" "}
					<code>/color</code> as the tab's title and background.
				</p>
			</div>
			<Switch
				id="claude-tab-decoration"
				checked={enabled}
				onCheckedChange={setEnabled}
			/>
		</div>
	);
}
