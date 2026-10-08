import { describe, expect, test } from "bun:test";
import { applyUiDirective, type DirectiveRouter } from "./applyUiDirective";

function fakeRouter() {
	const calls: string[] = [];
	const router: DirectiveRouter = {
		push: (href) => calls.push(`push ${href}`),
		dismissTo: (href) => calls.push(`dismissTo ${href}`),
		dismiss: () => calls.push("dismiss"),
		setParams: (params) => calls.push(`setParams ${JSON.stringify(params)}`),
	};
	return { router, calls };
}

describe("applyUiDirective", () => {
	test("pushes a workspace from home", () => {
		const { router, calls } = fakeRouter();
		const moved = applyUiDirective(
			{ navigate: { screen: "workspace", workspaceId: "ws1" } },
			{ router, pathname: "/" },
		);
		expect(moved).toBe(true);
		expect(calls).toEqual(["push /(authenticated)/workspace/ws1"]);
	});

	test("does nothing when already on the target", () => {
		const { router, calls } = fakeRouter();
		const moved = applyUiDirective(
			{ navigate: { screen: "workspace", workspaceId: "ws1" } },
			{ router, pathname: "/workspace/ws1" },
		);
		expect(moved).toBe(false);
		expect(calls).toEqual([]);
	});

	test("switches the session tab when already in that workspace", () => {
		const { router, calls } = fakeRouter();
		const moved = applyUiDirective(
			{
				navigate: { screen: "workspace", workspaceId: "ws1", terminalId: "t2" },
			},
			{ router, pathname: "/workspace/ws1" },
		);
		expect(moved).toBe(true);
		expect(calls).toEqual(['setParams {"tab":"t2"}']);
	});

	test("unwinds to home instead of pushing it", () => {
		const { router, calls } = fakeRouter();
		applyUiDirective(
			{ navigate: { screen: "home" } },
			{ router, pathname: "/workspace/ws1" },
		);
		expect(calls).toEqual(["dismissTo /(authenticated)/(home)"]);
	});

	test("closes an open sheet before showing another screen", () => {
		const { router, calls } = fakeRouter();
		applyUiDirective(
			{ navigate: { screen: "page", slug: "usage-v2" } },
			{ router, pathname: "/workspace/ws1/sessions" },
		);
		expect(calls).toEqual(["dismiss", "push /(authenticated)/pages/usage-v2"]);
	});

	test("opens a sheet on top of its workspace", () => {
		const { router, calls } = fakeRouter();
		applyUiDirective(
			{ navigate: { screen: "sessions", workspaceId: "ws1" } },
			{ router, pathname: "/workspace/ws1" },
		);
		expect(calls).toEqual(["push /(authenticated)/workspace/ws1/sessions"]);
	});

	test("a highlight-only directive navigates nowhere", () => {
		const { router, calls } = fakeRouter();
		expect(
			applyUiDirective(
				{ highlightWorkspaceIds: ["ws1"] },
				{ router, pathname: "/" },
			),
		).toBe(false);
		expect(calls).toEqual([]);
	});
});
