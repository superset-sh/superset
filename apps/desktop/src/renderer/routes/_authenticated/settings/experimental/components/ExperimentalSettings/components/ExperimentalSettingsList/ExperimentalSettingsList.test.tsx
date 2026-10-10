import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SETTING_ITEM_ID } from "../../../../../utils/settings-search";
import { ExperimentalSettingsList } from "./ExperimentalSettingsList";

function renderSettings({
	isV1FlipLocked = false,
	isV2OnlyUser = false,
}: {
	isV1FlipLocked?: boolean;
	isV2OnlyUser?: boolean;
}) {
	return renderToStaticMarkup(
		<ExperimentalSettingsList
			visibleItems={[
				SETTING_ITEM_ID.EXPERIMENTAL_SUPERSET_V2,
				SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION,
			]}
			isV2CloudEnabled={isV1FlipLocked || isV2OnlyUser}
			isV2OnlyUser={isV2OnlyUser}
			isV1FlipLocked={isV1FlipLocked}
		/>,
	);
}

describe("ExperimentalSettings v1/v2 switch", () => {
	test("v1 user without a migration marker sees the toggle and the v1 import", () => {
		const markup = renderSettings({});
		expect(markup).toContain("Try Superset v2");
		expect(markup).toContain("Import from v1");
	});

	test("migrated (flip-locked) machine hides the dead toggle but keeps Import from v1 as the recovery path", () => {
		const markup = renderSettings({ isV1FlipLocked: true });
		expect(markup).not.toContain("Try Superset v2");
		expect(markup).toContain("Import from v1");
	});

	test("v2-only signup without a marker still sees the toggle (opt-out remains real)", () => {
		const markup = renderSettings({ isV2OnlyUser: true });
		expect(markup).toContain("Try Superset v2");
		expect(markup).not.toContain("Import from v1");
	});
});
