import {
	afterAll,
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom over the preloaded plain-object document: the page renders real
// markup through React. Bun runs test files sequentially in one process and
// happy-dom's globals are process-wide, so unregister in afterAll to restore
// the shared mock document for the other renderer suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The session the recovery hook reports. Each case swaps it before rendering;
// the hook itself is covered by its own suite.
const retrySession = mock(() => {});
let sessionState: {
	hasLocalToken: boolean;
	isPending: boolean;
	session: { user: { id: string } } | null;
	sessionError: unknown;
	refetchSession: () => void;
} = {
	hasLocalToken: true,
	isPending: false,
	session: null,
	sessionError: null,
	refetchSession: retrySession,
};

// Spread the real module so the page keeps the real isNetworkFetchError (the
// behaviour under test); only the hook's session input is swapped.
const realRecovery = await import("./hooks/useSessionRecovery");
mock.module("./hooks/useSessionRecovery", () => ({
	...realRecovery,
	useSessionRecovery: () => sessionState,
}));
// Spread the real module: replacing it wholesale drops the exports other
// renderer code imported at module load (Link, Navigate, useRouter, ...).
const realRouter = await import("@tanstack/react-router");
mock.module("@tanstack/react-router", () => ({
	...realRouter,
	createFileRoute: () => (options: unknown) => options,
	useNavigate: () => () => Promise.resolve(),
	// The dev-bypass case renders <Redirect>, which resolves its destination
	// through the router. Outside a RouterProvider the real hook returns null
	// and `router.buildLocation` throws, so stub just enough of it.
	useRouter: () => ({
		buildLocation: (options: unknown) => ({
			href: String((options as { to?: string })?.to ?? "/"),
		}),
	}),
}));
mock.module("renderer/lib/analytics", () => ({ track: () => {} }));
// A full stub rather than a spread: the real client is a proxy, so spreading it
// drops createClient, which renderer/lib/trpc-client calls at module load.
mock.module("renderer/lib/electron-trpc", () => ({
	electronTrpc: {
		createClient: () => ({}),
		auth: {
			signIn: { useMutation: () => ({ mutate: () => {}, isPending: false }) },
			persistToken: { useMutation: () => ({ mutateAsync: async () => {} }) },
		},
	},
}));
const realEnv = await import("renderer/env.renderer");
// One mutable env object the cases can flip. The page reads `env.X` at render
// time, so a property change is visible without re-registering the mock — which
// is what lets a case exercise the SKIP_ENV_VALIDATION bypass below.
const mockedEnv = { ...realEnv.env, NODE_ENV: "production" as const };
mock.module("renderer/env.renderer", () => ({
	...realEnv,
	env: mockedEnv,
}));

const { SignInPage } = await import("./page");
const { cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const NETWORK_ERROR = new TypeError("Failed to fetch");

function setSession(next: {
	hasLocalToken?: boolean;
	isPending?: boolean;
	session?: { user: { id: string } } | null;
	sessionError?: unknown;
}) {
	sessionState = { ...sessionState, ...next };
}

describe("SignInPage", () => {
	beforeEach(() => retrySession.mockClear());

	test("names the unreachable API host when the session fetch fails on the network", () => {
		setSession({ hasLocalToken: true, sessionError: NETWORK_ERROR });

		const { container } = render(<SignInPage />);

		expect(container.textContent).toContain("Can't reach api.superset.sh");
		expect(container.textContent).toContain(
			"Check your network, VPN, or DNS filter",
		);

		fireEvent.click(screen.getByRole("button", { name: "Retry" }));
		expect(retrySession).toHaveBeenCalledTimes(1);
	});

	test("handles a rejecting session refetch from the Retry button", async () => {
		setSession({ hasLocalToken: true, sessionError: NETWORK_ERROR });

		const warnSpy = mock(() => {});
		const originalWarn = console.warn;
		(console as unknown as { warn: unknown }).warn =
			warnSpy as unknown as typeof console.warn;
		try {
			retrySession.mockImplementation(() =>
				Promise.reject(new Error("still down")),
			);

			render(<SignInPage />);
			fireEvent.click(screen.getByRole("button", { name: "Retry" }));

			// Give the rejection's catch a microtask to run.
			await new Promise((resolve) => setTimeout(resolve, 0));

			expect(retrySession).toHaveBeenCalledTimes(1);
			expect(warnSpy).toHaveBeenCalled();
			expect(String(warnSpy.mock.calls[0]?.[0])).toContain(
				"session retry refetch failed",
			);
		} finally {
			(console as unknown as { warn: unknown }).warn = originalWarn;
			retrySession.mockImplementation(() => {});
		}
	});

	test("stays quiet while the session request is still in flight", () => {
		setSession({ hasLocalToken: true, isPending: true, sessionError: null });

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
	});

	test("stays quiet when the API answered and simply has no session", () => {
		setSession({ hasLocalToken: false, isPending: false, sessionError: null });

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
		expect(container.textContent).toContain("Sign in to get started");
	});

	test("stays quiet when the API rejected the session over HTTP", () => {
		setSession({
			hasLocalToken: true,
			sessionError: { status: 401, message: "Unauthorized" },
		});

		const { container } = render(<SignInPage />);

		expect(container.textContent).not.toContain("Can't reach");
	});

	test("still runs the dev bypass when the API URL is malformed", () => {
		// Under SKIP_ENV_VALIDATION the renderer reads raw env values, so the URL
		// is whatever the developer exported. The page used to parse it
		// unconditionally, ABOVE the bypass, so `new URL("")` threw out of the
		// render and the bypass never ran — a blank screen instead of the
		// workspace redirect (#7881 review).
		setSession({ hasLocalToken: true, sessionError: NETWORK_ERROR });
		mockedEnv.SKIP_ENV_VALIDATION = true;
		mockedEnv.NEXT_PUBLIC_API_URL = "";

		try {
			const { container } = render(<SignInPage />);

			expect(container.textContent).not.toContain("Sign in to get started");
		} finally {
			mockedEnv.SKIP_ENV_VALIDATION = false;
			mockedEnv.NEXT_PUBLIC_API_URL = "https://api.superset.sh";
		}
	});
});
