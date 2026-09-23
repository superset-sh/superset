import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — Radix's tooltip trigger
// needs a real DOM. Bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so we MUST unregister in afterAll to
// restore the shared mock document for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { DashboardSidebarPageCommentsChip } = await import(
	"./DashboardSidebarPageCommentsChip"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("DashboardSidebarPageCommentsChip", () => {
	test("renders nothing when no comment is waiting", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsChip count={0} />,
		);

		expect(container.firstElementChild).toBeNull();
	});

	test("describes the count without relying on the tooltip", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsChip count={3} />,
		);

		const chip = container.firstElementChild as HTMLElement;
		expect(chip.querySelector("span[aria-hidden='true']")?.textContent).toBe(
			"3",
		);
		expect(chip.querySelector(".sr-only")?.textContent).toBe(
			"3 page comments are waiting on an agent here",
		);
	});

	test("caps the rendered count but describes the real one", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsChip count={150} />,
		);

		const chip = container.firstElementChild as HTMLElement;
		expect(chip.querySelector("span[aria-hidden='true']")?.textContent).toBe(
			"99+",
		);
		expect(chip.querySelector(".sr-only")?.textContent).toBe(
			"150 page comments are waiting on an agent here",
		);
	});

	test("carries the comment icon the other chips' chassis expects", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsChip count={1} />,
		);

		const chip = container.firstElementChild as HTMLElement;
		expect(chip.className).toContain("rounded-full");
		expect(chip.className).toContain("bg-muted/60");
		expect(chip.querySelector("svg")).not.toBeNull();
	});
});
