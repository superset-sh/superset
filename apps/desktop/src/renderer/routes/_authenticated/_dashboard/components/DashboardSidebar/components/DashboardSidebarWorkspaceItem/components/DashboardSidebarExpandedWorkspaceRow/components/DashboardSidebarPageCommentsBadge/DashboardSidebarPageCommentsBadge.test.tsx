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
const { DashboardSidebarPageCommentsBadge } = await import(
	"./DashboardSidebarPageCommentsBadge"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("DashboardSidebarPageCommentsBadge", () => {
	test("renders nothing when no comment is waiting", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsBadge count={0} />,
		);

		expect(container.firstElementChild).toBeNull();
	});

	test("describes the count without relying on the tooltip", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsBadge count={3} />,
		);

		const badge = container.firstElementChild as HTMLElement;
		expect(badge.querySelector("[aria-hidden='true']")?.textContent).toBe("3");
		expect(badge.querySelector(".sr-only")?.textContent).toBe(
			"3 page comments are waiting on an agent here",
		);
	});

	test("caps the rendered count but describes the real one", () => {
		const { container } = render(
			<DashboardSidebarPageCommentsBadge count={150} />,
		);

		const badge = container.firstElementChild as HTMLElement;
		expect(badge.querySelector("[aria-hidden='true']")?.textContent).toBe(
			"99+",
		);
		expect(badge.querySelector(".sr-only")?.textContent).toBe(
			"150 page comments are waiting on an agent here",
		);
	});
});
