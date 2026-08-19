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

// happy-dom's globals are process-wide and bun runs test files sequentially in
// one process, so unregister in afterAll to avoid leaking readonly DOM globals
// into other suites.
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
// beforeEach replaces window.location; keep the original descriptor so
// afterAll can restore it even when this suite doesn't own the registration.
const originalLocation = Object.getOwnPropertyDescriptor(window, "location");
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const consentMock = mock(
	async (_body: { accept: boolean; scope?: string }) =>
		({ data: null, error: null }) as {
			data: { redirect?: boolean; url?: string } | null;
			error: { message?: string } | null;
		},
);
const setActiveMock = mock(async (_body: { organizationId: string }) => ({
	data: null,
	error: null,
}));

mock.module("@superset/auth/client", () => ({
	authClient: {
		oauth2: { consent: consentMock },
		organization: { setActive: setActiveMock },
	},
}));

const { act, cleanup, fireEvent, render, screen } = await import(
	"@testing-library/react"
);
const { ConsentForm } = await import("./ConsentForm");

const baseProps = {
	clientId: "superset-cli",
	clientName: "Superset CLI",
	scopes: ["openid", "profile", "email", "offline_access"],
	userName: "Test User",
	organizations: [{ id: "org_1", name: "Acme" }],
	defaultOrganizationId: "org_1",
};

function authorizeButton(): HTMLButtonElement {
	return screen.getByRole("button", { name: "Authorize" });
}

beforeEach(() => {
	consentMock.mockClear();
	setActiveMock.mockClear();
	// Replace happy-dom's Location with a plain object so the component's
	// `window.location.href = url` assignment is observable instead of
	// triggering a simulated navigation.
	Object.defineProperty(window, "location", {
		value: {
			href: "http://localhost:3000/oauth/consent?client_id=superset-cli",
		},
		writable: true,
		configurable: true,
	});
});

afterEach(cleanup);
afterAll(async () => {
	if (originalLocation) {
		Object.defineProperty(window, "location", originalLocation);
	} else {
		Reflect.deleteProperty(window, "location");
	}
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

describe("ConsentForm", () => {
	test("navigates to the redirect url when consent succeeds", async () => {
		const callbackUrl = "http://127.0.0.1:51789/callback?code=abc&state=xyz";
		consentMock.mockResolvedValue({
			data: { redirect: true, url: callbackUrl },
			error: null,
		});

		render(<ConsentForm {...baseProps} />);
		await act(async () => {
			fireEvent.click(authorizeButton());
		});

		expect(window.location.href).toBe(callbackUrl);
	});

	test("shows an error and re-enables the button when consent succeeds without a redirect url", async () => {
		// A 200 response whose body carries no redirect target must not wedge the
		// page in a disabled "Authorizing..." state with no feedback (GH #6609).
		consentMock.mockResolvedValue({ data: {}, error: null });

		render(<ConsentForm {...baseProps} />);
		await act(async () => {
			fireEvent.click(authorizeButton());
		});

		expect(screen.getByText(/did not return a redirect URL/i)).toBeTruthy();
		const button = authorizeButton();
		expect(button.disabled).toBe(false);
		expect(window.location.href).toContain("/oauth/consent");
	});

	test("shows the server error message when consent fails", async () => {
		consentMock.mockResolvedValue({
			data: null,
			error: { message: "invalid_request" },
		});

		render(<ConsentForm {...baseProps} />);
		await act(async () => {
			fireEvent.click(authorizeButton());
		});

		expect(screen.getByText("invalid_request")).toBeTruthy();
		expect(authorizeButton().disabled).toBe(false);
	});
});
