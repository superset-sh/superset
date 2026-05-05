import { useIsV2CloudEnabled } from "renderer/hooks/useIsV2CloudEnabled";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";
import { V2AgentsSettings } from "../V2AgentsSettings";
import { AgentCard } from "./components/AgentCard";

interface AgentsSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function AgentsSettings({ visibleItems }: AgentsSettingsProps) {
	const { isV2CloudEnabled } = useIsV2CloudEnabled();
	if (isV2CloudEnabled) {
		return <V2AgentsSettings />;
	}
	return <V1AgentsSettings visibleItems={visibleItems} />;
}

function V1AgentsSettings({ visibleItems }: AgentsSettingsProps) {
	const { data: presets = [], isLoading } =
		electronTrpc.settings.getAgentPresets.useQuery();

	const showEnabled = isItemVisible(
		SETTING_ITEM_ID.AGENTS_ENABLED,
		visibleItems,
	);
	const showCommands = isItemVisible(
		SETTING_ITEM_ID.AGENTS_COMMANDS,
		visibleItems,
	);
	const showTaskPrompts = isItemVisible(
		SETTING_ITEM_ID.AGENTS_TASK_PROMPTS,
		visibleItems,
	);

	return (
		<div className="p-6 max-w-5xl w-full mx-auto">
			<div className="mb-8">
				<h2 className="text-xl font-semibold">Agents</h2>
				<p className="text-sm text-muted-foreground mt-1">
					Configure which agents appear in launchers and how their launches are
					built.
				</p>
			</div>

			{isLoading ? (
				<p className="text-sm text-muted-foreground">
					Loading agent settings...
				</p>
			) : (
				<div className="space-y-4">
					{presets.map((preset) => (
						<AgentCard
							key={preset.id}
							preset={preset}
							showEnabled={showEnabled}
							showCommands={showCommands}
							showTaskPrompts={showTaskPrompts}
						/>
					))}
				</div>
			)}
		</div>
	);
}
