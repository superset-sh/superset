import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

// happy-dom for real clicks; unregister in afterAll so the shared mock
// document used by the other renderer suites is restored (see Redirect.test).
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "org-flip-notice";
const tracked: string[] = [];
let relaunchCalls = 0;

mock.module("renderer/lib/analytics", () => ({
	track: (event: string) => {
		tracked.push(event);
	},
}));
mock.module("renderer/lib/trpc-client", () => ({
	electronTrpcClient: {
		settings: {
			relaunchApp: {
				mutate: async () => {
					relaunchCalls++;
					return { success: true };
				},
			},
		},
	},
}));
const realAuthClient = await import("renderer/lib/auth-client");
mock.module("renderer/lib/auth-client", () => ({
	...realAuthClient,
	authClient: {
		...realAuthClient.authClient,
		useSession: () => ({
			data: { session: { activeOrganizationId: ORG }, user: {} },
		}),
	},
}));
// The card's cover shader needs WebGL; the notice's behaviour does not.
mock.module("@paper-design/shaders-react", () => ({
	Dithering: () => null,
}));

// Queries come from render(): the module-level `screen` binds document.body
// at first import, which an earlier suite may have done against the shared
// mock document rather than happy-dom.
const { act, cleanup, fireEvent, render } = await import(
	"@testing-library/react"
);
const { markV1MigrationComplete } = await import(
	"renderer/lib/v1-migration/completion"
);
const { V1FlipNotice } = await import("./V1FlipNotice");

afterEach(() => {
	cleanup();
	tracked.length = 0;
	relaunchCalls = 0;
});
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("V1FlipNotice", () => {
	test("renders nothing until the org's migration completes", () => {
		const { queryByText } = render(<V1FlipNotice />);
		expect(queryByText("A better Superset is ready")).toBeNull();
	});

	test("shows once complete; Relaunch now tracks and relaunches", async () => {
		const { getByRole, getByText } = render(<V1FlipNotice />);
		await act(async () => {
			markV1MigrationComplete(ORG);
		});
		expect(getByText("A better Superset is ready")).toBeTruthy();
		expect(tracked).toContain("v1_flip_notice_shown");

		fireEvent.click(getByRole("button", { name: "Relaunch now" }));
		await act(async () => {});
		expect(relaunchCalls).toBe(1);
		expect(tracked).toContain("v1_flip_notice_relaunch");
		expect(tracked).not.toContain("v1_flip_notice_dismissed");
	});

	test("Later dismisses without relaunching", async () => {
		const { getByRole, queryByText } = render(<V1FlipNotice />);
		await act(async () => {
			markV1MigrationComplete(ORG);
		});
		fireEvent.click(getByRole("button", { name: "Later" }));
		expect(queryByText("A better Superset is ready")).toBeNull();
		expect(tracked).toContain("v1_flip_notice_dismissed");
		expect(relaunchCalls).toBe(0);
	});
});
