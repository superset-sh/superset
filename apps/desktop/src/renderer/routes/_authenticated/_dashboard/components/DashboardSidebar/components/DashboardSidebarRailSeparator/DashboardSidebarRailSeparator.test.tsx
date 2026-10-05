import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
const { cleanup, render } = await import("@testing-library/react");
const { DashboardSidebarRailSeparator } = await import(
	"./DashboardSidebarRailSeparator"
);

afterEach(() => cleanup());
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("rail separator", () => {
	test("a collection separator is labelled and uses the collection color", () => {
		const view = render(
			<DashboardSidebarRailSeparator
				collection={{ name: "Dibsteur", color: "#ef4444" }}
			/>,
		);
		const separator = view.getByRole("separator");
		expect(separator.getAttribute("aria-label")).toBe("Collection: Dibsteur");
		expect(separator.style.backgroundColor).not.toBe("");
	});
	test("a collection without color falls back to the theme color", () => {
		const view = render(
			<DashboardSidebarRailSeparator
				collection={{ name: "Perso", color: null }}
			/>,
		);
		const separator = view.getByRole("separator");
		expect(separator.className).toContain("bg-muted-foreground");
		expect(separator.style.backgroundColor).toBe("");
	});
	test("the root separator is neutral", () => {
		const view = render(<DashboardSidebarRailSeparator />);
		const separator = view.getByRole("separator");
		expect(separator.getAttribute("aria-label")).toBe(
			"Projects outside collections",
		);
		expect(separator.className).toContain("bg-border");
	});
});
