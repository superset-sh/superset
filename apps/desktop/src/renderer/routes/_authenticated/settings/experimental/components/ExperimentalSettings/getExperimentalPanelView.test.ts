import { describe, expect, test } from "bun:test";
import { SETTING_ITEM_ID } from "../../../utils/settings-search";
import { getExperimentalPanelView } from "./getExperimentalPanelView";

const ALL_EXPERIMENTAL_ITEMS = [
	SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
	SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
	SETTING_ITEM_ID.EXPERIMENTAL_RESTART_ONBOARDING,
];

const V1_VISIBLE_ITEMS = [SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2];

describe("getExperimentalPanelView", () => {
	test("non-v2-only user on v1 sees the Try Superset v2 toggle", () => {
		const view = getExperimentalPanelView({
			isV2OnlyUser: false,
			visibleItems: V1_VISIBLE_ITEMS,
		});
		expect(view.showSupersetV2Toggle).toBe(true);
		expect(view.showRestartOnboardingButton).toBe(false);
		expect(view.showV2OnlyStatusMessage).toBe(false);
	});

	test("non-v2-only user on v2 sees the toggle and migration controls", () => {
		const view = getExperimentalPanelView({
			isV2OnlyUser: false,
			visibleItems: ALL_EXPERIMENTAL_ITEMS,
		});
		expect(view.showSupersetV2Toggle).toBe(true);
		expect(view.showV1MigrationButton).toBe(true);
		expect(view.showRestartOnboardingButton).toBe(true);
		expect(view.showV2OnlyStatusMessage).toBe(false);
	});

	test("v2-only user sees a status message instead of an absent toggle (issue #4762)", () => {
		const view = getExperimentalPanelView({
			isV2OnlyUser: true,
			visibleItems: ALL_EXPERIMENTAL_ITEMS,
		});
		expect(view.showSupersetV2Toggle).toBe(false);
		expect(view.showV1MigrationButton).toBe(false);
		expect(view.showRestartOnboardingButton).toBe(true);
		expect(view.showV2OnlyStatusMessage).toBe(true);
	});

	test("v2-only user without visible items shows nothing (e.g. filtered by search)", () => {
		const view = getExperimentalPanelView({
			isV2OnlyUser: true,
			visibleItems: [],
		});
		expect(view.showSupersetV2Toggle).toBe(false);
		expect(view.showV1MigrationButton).toBe(false);
		expect(view.showRestartOnboardingButton).toBe(false);
		expect(view.showV2OnlyStatusMessage).toBe(false);
	});
});
