import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { IconUploadField } from "./IconUploadField";

function renderPicker(hostUrl: string | null) {
	return renderToStaticMarkup(
		<IconUploadField
			projectId="project-1"
			projectName="Acme"
			hostUrl={hostUrl}
			iconUrl={null}
			hasCustomIcon={false}
			isIconRemoved={false}
			color={null}
		/>,
	);
}

describe("IconUploadField", () => {
	test("offers the icon and color picker for a project on a reachable host", () => {
		const markup = renderPicker("http://127.0.0.1:7777");
		expect(markup).toContain('aria-label="Change project icon and color"');
		expect(markup).not.toContain('disabled=""');
	});

	test("disables the picker while the project's host cannot be reached", () => {
		expect(renderPicker(null)).toContain('disabled=""');
	});
});
