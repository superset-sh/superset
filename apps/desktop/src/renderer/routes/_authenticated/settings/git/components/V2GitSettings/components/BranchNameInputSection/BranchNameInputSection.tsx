import { useLingui } from "@lingui/react/macro";
import { Switch } from "@superset/ui/switch";
import { useSettings } from "renderer/stores/settings";
import { SettingsRow } from "../../../../../components/SettingsRow";

export function BranchNameInputSection() {
	const { t } = useLingui();
	const enabled = useSettings((state) => state.showBranchNameInput);
	const update = useSettings((state) => state.update);

	return (
		<SettingsRow
			label={t({ message: "Show custom branch name input" })}
			hint={t({
				message: "Show a branch name field above the workspace creation prompt",
			})}
			htmlFor="show-branch-name-input"
		>
			<Switch
				id="show-branch-name-input"
				checked={enabled}
				onCheckedChange={(checked) => update("showBranchNameInput", checked)}
			/>
		</SettingsRow>
	);
}
