import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — the marquee measures
// scrollWidth/clientWidth through refs and a ResizeObserver, so it needs a
// real DOM. Bun runs test files sequentially in one process and happy-dom's
// globals are process-wide, so we MUST unregister in afterAll to restore the
// shared mock document for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { cleanup, render } = await import("@testing-library/react");
const { WorkspaceNameMarquee } = await import("./WorkspaceNameMarquee");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("WorkspaceNameMarquee", () => {
	test("renders the bare name when no prefix is given", () => {
		const { container } = render(<WorkspaceNameMarquee name="local" />);

		const marquee = container.firstElementChild as HTMLElement;
		expect(marquee.textContent).toBe("local");
		expect(marquee.title).toBe("local");
	});

	test("prepends the prefix and a separator to the name", () => {
		const { container } = render(
			<WorkspaceNameMarquee name="local" prefix="Flamaster" />,
		);

		expect((container.firstElementChild as HTMLElement).textContent).toBe(
			"Flamaster/local",
		);
	});

	test("titles the whole prefixed label so a clipped row still reads in full", () => {
		const { container } = render(
			<WorkspaceNameMarquee name="basic_optimization" prefix="Bifrost" />,
		);

		expect((container.firstElementChild as HTMLElement).title).toBe(
			"Bifrost/basic_optimization",
		);
	});

	test("dims the prefix so the workspace name stays the prominent half", () => {
		const { container } = render(
			<WorkspaceNameMarquee name="local" prefix="Flamaster" />,
		);

		const prefix = container.querySelector(".text-muted-foreground");
		expect(prefix?.textContent).toBe("Flamaster/");
	});

	test("ignores an empty prefix", () => {
		const { container } = render(
			<WorkspaceNameMarquee name="local" prefix="" />,
		);

		const marquee = container.firstElementChild as HTMLElement;
		expect(marquee.textContent).toBe("local");
		expect(marquee.title).toBe("local");
	});
});
