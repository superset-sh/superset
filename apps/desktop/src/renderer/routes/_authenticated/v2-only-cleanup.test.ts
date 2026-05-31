import { describe, expect, test } from "bun:test";
// biome-ignore lint/style/noRestrictedImports: source-level regression tests inspect files directly
import { existsSync, readdirSync, readFileSync } from "node:fs";
// biome-ignore lint/style/noRestrictedImports: source-level regression tests inspect files directly
import { join, relative } from "node:path";

const RENDERER_DIR = join(__dirname, "../..");
const REPO_ROOT = join(RENDERER_DIR, "../../../..");
const THIS_FILE = join(__dirname, "v2-only-cleanup.test.ts");

function readRenderer(relativePath: string): string {
	return readFileSync(join(RENDERER_DIR, relativePath), "utf-8");
}

function readRepo(relativePath: string): string {
	return readFileSync(join(REPO_ROOT, relativePath), "utf-8");
}

function* walkSource(dir: string): Generator<string> {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (entry.name === "node_modules" || entry.name === "routeTree.gen.ts") {
				continue;
			}
			yield* walkSource(fullPath);
			continue;
		}
		if (!entry.isFile()) continue;
		if (!/\.(ts|tsx)$/.test(entry.name)) continue;
		if (fullPath === THIS_FILE) continue;
		if (entry.name === "routeTree.gen.ts") continue;
		yield fullPath;
	}
}

describe("desktop v2-only cleanup", () => {
	test("desktop account page is email/password first and lands in v2", () => {
		const signIn = readRenderer("routes/sign-in/page.tsx");
		const authServer = readRepo("packages/auth/src/server.ts");

		expect(signIn).toContain("/api/auth/sign-in/email");
		expect(signIn).toContain("/api/auth/sign-up/email");
		expect(signIn).toContain("persistToken");
		expect(signIn).toContain('to: "/v2-workspaces"');
		expect(signIn).not.toContain("Local Admin");
		expect(authServer).toContain("emailAndPassword");
		expect(authServer).toContain("enabled: true");
	});

	test("authenticated desktop shell no longer routes through onboarding or v1 import", () => {
		const authLayout = readRenderer("routes/_authenticated/layout.tsx");
		const dashboardLayout = readRenderer(
			"routes/_authenticated/_dashboard/layout.tsx",
		);

		expect(authLayout).toContain("DashboardNewWorkspaceModal");
		expect(authLayout).not.toContain("V1ImportModal");
		expect(authLayout).not.toContain("/create-organization");
		expect(authLayout).not.toContain("/onboarding");
		expect(dashboardLayout).toContain("DashboardSidebar");
		expect(dashboardLayout).not.toContain(
			"screens/main/components/WorkspaceSidebar",
		);
		expect(dashboardLayout).not.toContain("<WorkspaceSidebar");
		expect(dashboardLayout).not.toContain("CrossVersionMismatchState");
	});

	test("legacy workspace and onboarding routes redirect to v2", () => {
		for (const route of [
			"routes/page.tsx",
			"routes/_authenticated/_dashboard/workspace/page.tsx",
			"routes/_authenticated/_dashboard/workspace/$workspaceId/page.tsx",
			"routes/_authenticated/_dashboard/workspaces/page.tsx",
			"routes/_authenticated/_dashboard/project/$projectId/page.tsx",
			"routes/_authenticated/onboarding/layout.tsx",
			"routes/_authenticated/onboarding/page.tsx",
			"routes/_authenticated/onboarding/project/page.tsx",
		]) {
			expect(readRenderer(route)).toContain('to="/v2-workspaces"');
		}
	});

	test("tasks navigation does not invoke the paywall gate", () => {
		const dashboardHeader = readRenderer(
			"routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx",
		);
		const legacyHeader = readRenderer(
			"screens/main/components/WorkspaceSidebar/WorkspaceSidebarHeader/WorkspaceSidebarHeader.tsx",
		);
		const paywallConstants = readRenderer("components/Paywall/constants.ts");

		expect(dashboardHeader).not.toContain("GATED_FEATURES.TASKS");
		expect(dashboardHeader).not.toContain("gateFeature");
		expect(legacyHeader).not.toContain("GATED_FEATURES.TASKS");
		expect(legacyHeader).not.toContain("gateFeature");
		expect(paywallConstants).not.toContain("TASKS");
	});

	test("deleted v1/v2 opt-in artifacts stay deleted", () => {
		for (const deletedPath of [
			"hooks/useIsV2CloudEnabled.ts",
			"stores/v2-local-override.ts",
			"stores/v1-import-modal.ts",
			"components/V2AvailableBanner/V2AvailableBanner.tsx",
			"routes/_authenticated/components/V1ImportModal/V1ImportModal.tsx",
			"routes/_authenticated/_dashboard/components/CrossVersionMismatchState/CrossVersionMismatchState.tsx",
		]) {
			expect(existsSync(join(RENDERER_DIR, deletedPath))).toBe(false);
		}

		const offenders: string[] = [];
		for (const file of walkSource(RENDERER_DIR)) {
			const source = readFileSync(file, "utf-8");
			if (
				source.includes("useIsV2CloudEnabled") ||
				source.includes("v2-local-override") ||
				source.includes("V1ImportModal") ||
				source.includes("CrossVersionMismatchState")
			) {
				offenders.push(relative(RENDERER_DIR, file));
			}
		}

		expect(offenders).toEqual([]);
	});
});
