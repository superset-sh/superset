import { afterAll, afterEach, describe, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const realAuthClient = await import("renderer/lib/auth-client");
mock.module("renderer/lib/auth-client", () => ({
	...realAuthClient,
	authClient: {
		...realAuthClient.authClient,
		useSession: () => ({
			data: { session: { activeOrganizationId: "org-active" } },
		}),
	},
}));
mock.module("renderer/lib/analytics", () => ({
	track: () => {},
}));

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { cleanup, render } = await import("@testing-library/react");
afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

const { useV1MigrationStatusStore } = await import(
	"renderer/stores/v1-migration-status"
);
const { V1MigrationStatusCard } = await import("./V1MigrationStatusCard");

function renderWith(
	organizationId: string,
	status: "idle" | "running" | "blocked",
) {
	useV1MigrationStatusStore.getState().setStatus(organizationId, status);
	cleanup();
	return render(<V1MigrationStatusCard />).container.innerHTML;
}

describe("V1MigrationStatusCard", () => {
	test("shows progress while the first migration runs", () => {
		expect(renderWith("org-active", "running")).toContain(
			"Bringing over your v1 projects",
		);
	});

	test("points a blocked migration at the importer", () => {
		expect(renderWith("org-active", "blocked")).toContain("Open importer");
	});

	test("renders nothing when idle or for another org", () => {
		expect(renderWith("org-active", "idle")).toBe("");
		expect(renderWith("org-other", "blocked")).toBe("");
	});
});
