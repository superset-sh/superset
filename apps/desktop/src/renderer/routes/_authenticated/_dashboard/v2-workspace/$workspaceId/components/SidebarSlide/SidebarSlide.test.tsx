import { afterEach, describe, expect, test } from "bun:test";
import type { SidebarSlideMode } from "./SidebarSlide";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const { SidebarSlide } = await import("./SidebarSlide");

afterEach(cleanup);

const settle = () =>
	act(() => new Promise<void>((resolve) => setTimeout(resolve, 40)));

function renderSlide(mode: SidebarSlideMode, keepMounted = false) {
	const fills: boolean[] = [];
	const ui = (next: SidebarSlideMode) => (
		<SidebarSlide
			mode={next}
			width={300}
			expandedWidth={900}
			keepMounted={keepMounted}
			durationMs={1}
		>
			{(fill) => {
				fills.push(fill);
				return <div data-testid="panel">panel</div>;
			}}
		</SidebarSlide>
	);
	const result = render(ui(mode));
	return {
		...result,
		fills,
		setMode: (next: SidebarSlideMode) => result.rerender(ui(next)),
		panel: () => result.queryByTestId("panel"),
	};
}

describe("SidebarSlide", () => {
	test("renders nothing until it is first opened", () => {
		expect(renderSlide("closed").panel()).toBeNull();
	});

	test("expanding and restoring keep the same panel node, filling while expanded", async () => {
		const slide = renderSlide("open");
		const node = slide.panel();
		slide.setMode("expanded");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(slide.fills.at(-1)).toBe(true);
		slide.setMode("open");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(slide.fills.at(-1)).toBe(false);
	});

	test("closing unmounts the panel unless asked to keep it", async () => {
		const slide = renderSlide("open");
		slide.setMode("closed");
		await settle();
		expect(slide.panel()).toBeNull();
	});

	test("a kept panel survives close and reopen, hidden and inert while closed", async () => {
		const slide = renderSlide("open", true);
		const node = slide.panel();
		slide.setMode("closed");
		await settle();
		const content = node?.parentElement;
		expect(slide.panel()).toBe(node);
		expect(content?.hasAttribute("inert")).toBe(true);
		expect(content?.className).toContain("invisible");
		slide.setMode("open");
		await settle();
		expect(slide.panel()).toBe(node);
		expect(content?.hasAttribute("inert")).toBe(false);
	});

	test("settles on the last mode when toggled mid-move", async () => {
		const slide = renderSlide("open", true);
		slide.setMode("closed");
		slide.setMode("open");
		slide.setMode("closed");
		await settle();
		expect(slide.panel()?.parentElement?.hasAttribute("inert")).toBe(true);
	});
});
