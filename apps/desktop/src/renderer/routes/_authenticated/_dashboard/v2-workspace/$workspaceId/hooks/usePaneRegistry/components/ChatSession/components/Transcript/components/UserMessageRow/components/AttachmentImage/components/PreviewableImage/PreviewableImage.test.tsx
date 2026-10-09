import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, fireEvent, render } = await import("@testing-library/react");
const { PreviewableImage } = await import("./PreviewableImage");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const SRC = "data:image/png;base64,iVBORw0KGgo=";

describe("PreviewableImage", () => {
	test("opens the full-size preview on click", () => {
		const view = render(
			<PreviewableImage
				filename="shot.png"
				onDownload={mock(async () => {})}
				onError={mock(() => {})}
				src={SRC}
			/>,
		);
		const thumbnail = view.getByRole("button", { name: "Preview shot.png" });
		expect(view.getAllByAltText("shot.png")).toHaveLength(1);

		fireEvent.click(thumbnail);
		const images = view.getAllByAltText("shot.png");
		expect(images).toHaveLength(2);
		expect(images.every((image) => image.getAttribute("src") === SRC)).toBe(
			true,
		);
		expect(view.getByRole("button", { name: "Close preview" })).toBeTruthy();
	});

	test("draws no border of its own around the thumbnail", () => {
		const view = render(
			<PreviewableImage
				filename="shot.png"
				onDownload={mock(async () => {})}
				onError={mock(() => {})}
				src={SRC}
			/>,
		);
		const thumbnail = view.getByRole("button", { name: "Preview shot.png" });
		for (const element of [thumbnail, ...thumbnail.querySelectorAll("*")])
			expect(element.className).not.toMatch(/\bborder\b/);
	});
});
