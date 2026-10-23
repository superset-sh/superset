import { afterEach, describe, expect, test } from "bun:test";
import type { TRPCLink } from "@trpc/client";
import type { AppRouter } from "lib/trpc/routers";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { observable } = await import("@trpc/server/observable");
const { act, cleanup, render, waitFor } = await import(
	"@testing-library/react"
);
const { electronTrpc } = await import("renderer/lib/electron-trpc");
const { useSettingsExternalChangeListener } = await import(
	"renderer/hooks/useSettingsExternalChangeListener"
);
const { NOTIFICATION_EVENTS } = await import("shared/constants");
const { useHideEmptySidebarProjects } = await import(
	"./useHideEmptySidebarProjects"
);

function Probe() {
	useSettingsExternalChangeListener();
	const [enabled] = useHideEmptySidebarProjects();
	return <div data-testid="value">{String(enabled)}</div>;
}

function renderWithDesktop() {
	const desktop = {
		stored: false,
		emit: (_event: unknown) => {},
	};
	const link: TRPCLink<AppRouter> = () => (call) =>
		observable((observer) => {
			if (call.op.path === "settings.getHideEmptySidebarProjects") {
				observer.next({ result: { data: desktop.stored } });
				observer.complete();
			}
			if (call.op.path === "notifications.subscribe") {
				desktop.emit = (event) =>
					observer.next({ result: { type: "data", data: event } });
			}
		});
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const view = render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [link] })}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>
				<Probe />
			</QueryClientProvider>
		</electronTrpc.Provider>,
	);
	return { view, desktop };
}

afterEach(() => {
	cleanup();
});

describe("useHideEmptySidebarProjects", () => {
	test("picks up a CLI write when the desktop reports an external settings change", async () => {
		const { view, desktop } = renderWithDesktop();
		await waitFor(() =>
			expect(view.getByTestId("value").textContent).toBe("false"),
		);

		desktop.stored = true;
		act(() =>
			desktop.emit({ type: NOTIFICATION_EVENTS.SETTINGS_EXTERNAL_CHANGE }),
		);

		await waitFor(() =>
			expect(view.getByTestId("value").textContent).toBe("true"),
		);
	});
});
