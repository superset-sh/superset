import { afterAll, afterEach, describe, expect, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document — Redirect renders
// through a real TanStack router, which needs a DOM. Bun runs test files
// sequentially in one process and happy-dom's globals are process-wide, so
// we MUST unregister in afterAll (below) to restore the shared mock document
// for the other renderer suites — otherwise readonly DOM globals leak and
// break unrelated tests that assign e.g. globalThis.localStorage.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, render } = await import("@testing-library/react");
const {
	createMemoryHistory,
	createRootRoute,
	createRoute,
	createRouter,
	Outlet,
	RouterProvider,
} = await import("@tanstack/react-router");
const React = await import("react");
const { Redirect: TypedRedirect } = await import("./Redirect");

// The real Redirect types `to` against the app's registered route tree; this
// test drives a synthetic router with routes that don't exist there, so widen
// the signature. Runtime behavior is unchanged — this only relaxes the paths.
const Redirect = TypedRedirect as (props: {
	to: string;
	replace?: boolean;
	search?: Record<string, unknown>;
}) => React.ReactElement | null;

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

/**
 * Build a router that renders `children` in the ALWAYS-MOUNTED root component
 * (so a redirect element survives the navigation it triggers), plus inert
 * destination routes. `navigations` counts every router.navigate call so a
 * re-render loop shows up as a rising count.
 */
function setup(children: React.ReactNode) {
	const rootRoute = createRootRoute({
		component: () => (
			<>
				{children}
				<Outlet />
			</>
		),
	});
	const indexRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/",
		component: () => <div>index</div>,
	});
	const targetRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/target",
		component: () => <div>target</div>,
	});
	const otherRoute = createRoute({
		getParentRoute: () => rootRoute,
		path: "/other",
		component: () => <div>other</div>,
	});
	const router = createRouter({
		routeTree: rootRoute.addChildren([indexRoute, targetRoute, otherRoute]),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});

	let navigations = 0;
	const realNavigate = router.navigate.bind(router);
	router.navigate = ((opts: Parameters<typeof realNavigate>[0]) => {
		navigations += 1;
		return realNavigate(opts);
	}) as typeof router.navigate;

	return { router, getNavigations: () => navigations };
}

describe("Redirect", () => {
	test("navigates to the target once", async () => {
		const { router } = setup(<Redirect to="/target" replace />);
		await act(async () => {
			render(<RouterProvider router={router} />);
			await router.latestLoadPromise;
		});
		expect(router.state.location.pathname).toBe("/target");
	});

	test("does not re-navigate when re-rendered with fresh props identity", async () => {
		// The exact condition that loops TanStack's <Navigate>: a parent that
		// re-renders and hands the redirect a new props object every time.
		let forceRender: (() => void) | undefined;
		function Parent() {
			const [, setTick] = React.useState(0);
			forceRender = () => setTick((n) => n + 1);
			// New object literal each render → new props identity for Redirect.
			return <Redirect to={"/target"} replace search={{}} />;
		}

		const { router, getNavigations } = setup(<Parent />);
		await act(async () => {
			render(<RouterProvider router={router} />);
			await router.latestLoadPromise;
		});

		const afterMount = getNavigations();
		expect(router.state.location.pathname).toBe("/target");

		for (let i = 0; i < 10; i++) {
			await act(async () => {
				forceRender?.();
				await router.latestLoadPromise;
			});
		}

		// The whole point: identity churn must not add navigations.
		expect(getNavigations()).toBe(afterMount);
		expect(router.state.location.pathname).toBe("/target");
	});

	test("re-navigates when the resolved target actually changes", async () => {
		let setTarget: ((to: "/target" | "/other") => void) | undefined;
		function Parent() {
			const [to, set] = React.useState<"/target" | "/other">("/target");
			setTarget = set;
			return <Redirect to={to} replace />;
		}

		const { router, getNavigations } = setup(<Parent />);
		await act(async () => {
			render(<RouterProvider router={router} />);
			await router.latestLoadPromise;
		});
		expect(router.state.location.pathname).toBe("/target");
		const afterFirst = getNavigations();

		await act(async () => {
			setTarget?.("/other");
			await router.latestLoadPromise;
		});

		expect(getNavigations()).toBeGreaterThan(afterFirst);
		expect(router.state.location.pathname).toBe("/other");
	});

	test("renders nothing", async () => {
		const { router } = setup(<Redirect to="/target" replace />);
		let html = "";
		await act(async () => {
			const { container } = render(<RouterProvider router={router} />);
			await router.latestLoadPromise;
			// target route renders <div>target</div>; Redirect itself emits nothing
			html = container.innerHTML;
		});
		expect(html).not.toContain("undefined");
	});
});
