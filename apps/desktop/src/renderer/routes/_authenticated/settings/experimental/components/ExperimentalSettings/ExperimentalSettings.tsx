import {
	useIsV1FlipLocked,
	useIsV2CloudEnabled,
	useIsV2OnlyUser,
} from "renderer/hooks/useIsV2CloudEnabled";
import type { SettingItemId } from "../../../utils/settings-search";
import { ExperimentalSettingsList } from "./components/ExperimentalSettingsList";

interface ExperimentalSettingsProps {
	visibleItems?: SettingItemId[] | null;
}

export function ExperimentalSettings({
	visibleItems,
}: ExperimentalSettingsProps) {
	const isV2CloudEnabled = useIsV2CloudEnabled();
	const isV2OnlyUser = useIsV2OnlyUser();
	const isV1FlipLocked = useIsV1FlipLocked();
	return (
		<ExperimentalSettingsList
			visibleItems={visibleItems}
			isV2CloudEnabled={isV2CloudEnabled}
			isV2OnlyUser={isV2OnlyUser}
			isV1FlipLocked={isV1FlipLocked}
		/>
	);
}
