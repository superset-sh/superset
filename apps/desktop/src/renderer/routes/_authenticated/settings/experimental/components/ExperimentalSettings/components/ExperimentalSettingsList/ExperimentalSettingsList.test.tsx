import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SETTING_ITEM_ID } from "../../../../../utils/settings-search";
import { ExperimentalSettingsList } from "./ExperimentalSettingsList";

function renderSettings({ isV2OnlyUser = false }: { isV2OnlyUser?: boolean }) {
	return renderToStaticMarkup(
		<ExperimentalSettingsList
			visibleItems={[SETTING_ITEM_ID.EXPERIMENTAL_V1_MIGRATION]}
			isV2OnlyUser={isV2OnlyUser}
		/>,
	);
}

describe("ExperimentalSettings", () => {
	test("never offers a v1/v2 switch", () => {
		expect(renderSettings({})).not.toContain("Try Superset v2");
	});

	test("pre-cutoff account sees an enabled Import from v1", () => {
		const markup = renderSettings({});
		expect(markup).toContain("Import from v1");
		expect(markup).not.toMatch(/disabled=""[^>]*>Open importer/);
	});

	test("v2-only signup has nothing to import", () => {
		expect(renderSettings({ isV2OnlyUser: true })).not.toContain(
			"Import from v1",
		);
	});
});
