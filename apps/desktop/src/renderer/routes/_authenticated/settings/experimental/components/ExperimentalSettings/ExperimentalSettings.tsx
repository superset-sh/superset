import { useIsV2OnlyUser } from "renderer/hooks/useIsV2CloudEnabled";
import type { SettingItemId } from "../../../utils/settings-search";
import { ExperimentalSettingsList } from "./components/ExperimentalSettingsList";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const isV2OnlyUser = useIsV2OnlyUser();
	return (
		<ExperimentalSettingsList
			visibleItems={visibleItems}
			isV2OnlyUser={isV2OnlyUser}
		/>
	);
}
