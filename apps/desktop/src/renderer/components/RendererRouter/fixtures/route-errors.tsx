import { mock } from "bun:test";
import { transformAsync } from "@babel/core";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import linguiMacro from "@lingui/babel-plugin-lingui-macro";
import { plugin } from "bun";
import type { ReactNode } from "react";

plugin({
	name: "real-lingui-react-macros",
	setup(build) {
		build.onLoad(
			{
				filter:
					/\/(error|not-found|RendererErrorBoundary|ContentError|boot-errors)\.tsx?$/,
			},
			async ({ path }) => {
				if (path.includes("/node_modules/")) return;
				const code = await Bun.file(path).text();
				if (!/@lingui\/(react|core)\/macro/.test(code)) return;
				const result = await transformAsync(code, {
					filename: path,
					babelrc: false,
					configFile: false,
					parserOpts: { plugins: ["typescript", "jsx"] },
					plugins: [linguiMacro],
				});
				if (!result?.code) throw new Error(`Could not compile ${path}`);
				return { contents: result.code, loader: "tsx" };
			},
		);
	},
});

GlobalRegistrator.register({ url: "http://localhost" });
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const captured: unknown[] = [];
mock.module("@sentry/electron/renderer", () => ({
	captureException: (error: unknown) => captured.push(error),
}));
const originalError = new Error("Original route failure");
let failLayout = false;
let failErrorPage = false;
const fallbackError = new Error("Error page failed");
mock.module("../../../routes/-layout", () => ({
	RootLayout: ({ children }: { children: ReactNode }) => {
		if (failLayout) throw originalError;
		return children;
	},
}));

const { act, cleanup, fireEvent, render, waitFor } = await import(
	"@testing-library/react"
);
const { createMemoryHistory, createRoute, createRouter, Outlet } = await import(
	"@tanstack/react-router"
);
const { QueryClient } = await import("@tanstack/react-query");
const { i18n, initI18nAsync } = await import("@superset/i18n");
const { RendererRouter } = await import("../RendererRouter");
const { Route } = await import("../../../routes/__root");
const { ErrorPage } = await import("../../../routes/error");
const { RendererErrorBoundary } = await import("../../RendererErrorBoundary");
const { ContentError } = await import(
	"../../../routes/_authenticated/components/ContentError"
);
let failDashboardFallback = false;
mock.module("../../../routes/_authenticated/components/ContentError", () => ({
	ContentError: (props: Parameters<typeof ContentError>[0]) => {
		if (failDashboardFallback) throw fallbackError;
		return <ContentError {...props} />;
	},
}));
const { ContentBoundary } = await import(
	"../../../routes/_authenticated/components/ContentBoundary"
);
Route.options.errorComponent = (props) => {
	if (failErrorPage) throw fallbackError;
	return <ErrorPage {...props} />;
};

const home = createRoute({
	getParentRoute: () => Route,
	path: "/",
	component: () => <div data-testid="recovered-home" />,
});
const broken = createRoute({
	getParentRoute: () => Route,
	path: "/broken",
	loader: () => {
		throw originalError;
	},
});
const longError = new Error("Diagnostic ".repeat(3000));
const dashboard = createRoute({
	getParentRoute: () => Route,
	path: "/dashboard",
	component: () => (
		<div>
			<aside data-testid="retained-sidebar" />
			<ContentBoundary>
				<Outlet />
			</ContentBoundary>
		</div>
	),
});
const brokenDashboard = createRoute({
	getParentRoute: () => dashboard,
	path: "/broken",
	component: () => {
		throw longError;
	},
});
const healthyDashboard = createRoute({
	getParentRoute: () => dashboard,
	path: "/healthy",
	component: () => <div data-testid="recovered-dashboard" />,
});
const routeTree = Route.addChildren([
	home,
	broken,
	dashboard.addChildren([brokenDashboard, healthyDashboard]),
]);
const consoleErrors: unknown[][] = [];
console.error = (...args: unknown[]) => consoleErrors.push(args);
console.warn = () => {};

function check(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

try {
	for (const failure of [
		"layout",
		"loader",
		"not-found",
		"fallback",
	] as const) {
		captured.length = 0;
		consoleErrors.length = 0;
		failLayout = failure === "layout" || failure === "fallback";
		failErrorPage = failure === "fallback";
		await initI18nAsync("fr");
		const router = createRouter({
			routeTree,
			history: createMemoryHistory({
				initialEntries: [
					failure === "loader"
						? "/broken"
						: failure === "not-found"
							? "/missing"
							: "/",
				],
			}),
			context: { queryClient: new QueryClient() },
		});
		await act(async () => {
			render(<RendererRouter router={router} />);
			await router.load();
		});
		const heading =
			failure === "not-found" ? "Page introuvable" : "Une erreur est survenue";
		await waitFor(() =>
			check(
				document.body.textContent?.includes(heading),
				`${failure}: missing translated fallback`,
			),
		);
		check(i18n.locale === "fr", `${failure}: fallback reset the active locale`);
		const frame = document.querySelector<HTMLElement>(
			"[data-desktop-failure-layout]",
		);
		check(
			frame?.style.position === "fixed",
			`${failure}: missing window layout`,
		);
		check(
			frame.firstElementChild instanceof HTMLElement &&
				frame.firstElementChild.style.height === "48px",
			`${failure}: missing title bar clearance`,
		);
		check(
			frame.querySelector("main")?.style.overflow === "auto",
			`${failure}: content cannot scroll`,
		);
		if (failure === "fallback") {
			await waitFor(() =>
				check(
					captured.includes(fallbackError),
					"Fallback failure was swallowed",
				),
			);
			check(
				document
					.querySelector("pre")
					?.textContent?.includes(fallbackError.message),
				"Emergency details missing",
			);
			const reload = document.querySelector("button");
			const diagnostics = document.querySelector("pre");
			check(reload && diagnostics, "Emergency recovery missing");
			check(
				Boolean(
					reload.compareDocumentPosition(diagnostics) &
						Node.DOCUMENT_POSITION_FOLLOWING,
				),
				"Recovery must precede long diagnostics",
			);
			check(
				!document.body.textContent?.includes("Hide Error"),
				"Router default fallback escaped",
			);
		} else if (failure !== "not-found") {
			await waitFor(() =>
				check(
					captured.includes(originalError),
					`${failure}: original error not reported`,
				),
			);
			await act(async () => {
				fireEvent.click(
					document.querySelector(
						"button[aria-controls='error-details']",
					) as Element,
				);
			});
			check(
				document
					.querySelector("pre")
					?.textContent?.includes(originalError.stack ?? originalError.message),
				`${failure}: original error details missing`,
			);
		} else {
			check(captured.length === 0, "404 was reported as a crash");
		}
		check(
			!consoleErrors.some((args) =>
				args.some((arg) =>
					/Cannot destructure.*useLingui|useLingui.*without.*I18nProvider/.test(
						String(arg),
					),
				),
			),
			`${failure}: translation context failed`,
		);
		if (failure === "loader" || failure === "not-found") {
			await act(async () => {
				fireEvent.click(document.querySelector("a") as Element);
			});
			await waitFor(() =>
				check(
					document.querySelector('[data-testid="recovered-home"]'),
					"Go home did not recover",
				),
			);
		}
		cleanup();
	}
	failLayout = false;
	failErrorPage = false;
	const dashboardRouter = createRouter({
		routeTree,
		history: createMemoryHistory({ initialEntries: ["/dashboard/broken"] }),
		context: { queryClient: new QueryClient() },
	});
	await act(async () => {
		render(<RendererRouter router={dashboardRouter} />);
		await dashboardRouter.load();
	});
	await waitFor(() =>
		check(
			document.querySelector("h2")?.textContent ===
				"Cette vue a rencontré une erreur",
			"Dashboard fallback did not render",
		),
	);
	check(
		document.querySelector('[data-testid="retained-sidebar"]'),
		"Content error unmounted dashboard chrome",
	);
	const dashboardDetails = document.querySelector("p");
	const dashboardRecovery = document.querySelector("a");
	check(
		dashboardDetails?.textContent === longError.message && dashboardRecovery,
		"Dashboard diagnostics or recovery missing",
	);
	check(
		Boolean(
			dashboardRecovery.compareDocumentPosition(dashboardDetails) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		),
		"Dashboard recovery must precede long diagnostics",
	);
	await act(async () => {
		await dashboardRouter.navigate({ href: "/dashboard/healthy" });
	});
	await waitFor(() =>
		check(
			document.querySelector('[data-testid="recovered-dashboard"]'),
			`Nested boundary did not reset on navigation: ${dashboardRouter.state.location.href} ${dashboardRouter.state.matches.map((m) => m.routeId)}`,
		),
	);
	failDashboardFallback = true;
	await act(async () => {
		await dashboardRouter.navigate({ href: "/dashboard/broken" });
	});
	await waitFor(() =>
		check(
			document.querySelector("[data-desktop-failure-layout]"),
			"Broken dashboard fallback did not reach root fallback",
		),
	);
	check(
		!document.querySelector('[data-testid="retained-sidebar"]'),
		"Failed dashboard boundary remained mounted",
	);
	await waitFor(() =>
		check(
			captured.includes(fallbackError),
			"Dashboard fallback error was not reported",
		),
	);
	cleanup();

	function ProviderFailure(): never {
		throw new Error("Provider failed before mounting");
	}
	await act(async () => {
		render(
			<RendererErrorBoundary>
				<ProviderFailure />
			</RendererErrorBoundary>,
		);
	});
	check(
		document.querySelector("h1")?.textContent === "Une erreur est survenue",
		"Provider-free fallback did not translate",
	);
	check(
		document.querySelector("button")?.textContent === "Recharger",
		"Provider-free recovery missing",
	);
	cleanup();
	const boot = await import("../../../lib/boot-errors");
	const app = document.createElement("app");
	document.body.append(app);
	boot.initBootErrorHandling(app);
	boot.reportBootError("Boot failed", new Error("x".repeat(10000)));
	const bootFrame = app.querySelector<HTMLElement>(
		"[data-desktop-failure-layout]",
	);
	check(
		bootFrame?.firstElementChild instanceof HTMLElement &&
			bootFrame.firstElementChild.style.height === "48px",
		"Boot failure overlaps title bar",
	);
	check(
		bootFrame.querySelector("main")?.style.overflow === "auto",
		"Boot details cannot scroll",
	);
	check(
		bootFrame.querySelector("pre")?.style.overflowWrap === "anywhere",
		"Boot details overflow horizontally",
	);
	check(
		bootFrame.querySelector("button")?.textContent === "Recharger",
		"Boot fallback recovery missing",
	);
	check(
		(bootFrame.firstElementChild as HTMLElement).style.getPropertyValue(
			"-webkit-app-region",
		) === "drag" &&
			bootFrame
				.querySelector("main")
				?.style.getPropertyValue("-webkit-app-region") === "no-drag",
		"Boot fallback drag regions missing",
	);
	const contents = app.innerHTML;
	boot.markBootMounted();
	boot.reportBootError("Late error");
	check(
		app.innerHTML === contents,
		"Global handler replaced mounted React tree",
	);
	boot.cleanupBootErrorHandling();
	app.remove();

	console.log("passed");
} finally {
	cleanup();
	await GlobalRegistrator.unregister();
}
