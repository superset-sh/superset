import {
	isItemVisible,
	SETTING_ITEM_ID,
	type SettingItemId,
} from "../../../utils/settings-search";

export interface ExperimentalPanelView {
	showSupersetV2Toggle: boolean;
	showV1MigrationButton: boolean;
	showRestartOnboardingButton: boolean;
	showV2OnlyStatusMessage: boolean;
}

export function getExperimentalPanelView(params: {
	isV2OnlyUser: boolean;
	visibleItems: SettingItemId[] | null | undefined;
}): ExperimentalPanelView {
	const { isV2OnlyUser, visibleItems } = params;

	const supersetV2Visible = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
		visibleItems,
	);
	const v1MigrationVisible = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
		visibleItems,
	);
	const restartOnboardingVisible = isItemVisible(
		SETTING_ITEM_ID.EXPERIMENTAL_RESTART_ONBOARDING,
		visibleItems,
	);

	return {
		showSupersetV2Toggle: supersetV2Visible && !isV2OnlyUser,
		showV1MigrationButton: v1MigrationVisible && !isV2OnlyUser,
		showRestartOnboardingButton: restartOnboardingVisible,
		showV2OnlyStatusMessage: isV2OnlyUser && supersetV2Visible,
	};
}
