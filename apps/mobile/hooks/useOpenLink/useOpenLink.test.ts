import { afterEach, expect, test } from "bun:test";
import { mobileM2Fixture, runMobileM2Child } from "./testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual mobile consumer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	afterEach(f.cleanup);
	const { useOpenLink } = await import("./useOpenLink");
	let open!: ReturnType<typeof useOpenLink>;
	function Probe() {
		open = useOpenLink({ workspaceId: "workspace" });
		return null;
	}
	test("native browser URL enters current workspace with complete identity", async () => {
		await f.render(Probe);
		open(`${f.nativeUrl}?diff=split#note_9`);
		expect(f.state.pushes).toEqual([
			{
				pathname: "/workspace/[id]/pull-request/[pullRequestId]",
				params: {
					id: "workspace",
					pullRequestId: "17",
					owner: "Group/Sub",
					repo: "Repo",
					provider: "gitlab",
					expectedUrl: f.nativeUrl,
				},
			},
		]);
	});
	test("GH route carries explicit provider from a native workspace", async () => {
		await f.render(Probe);
		open("https://github.com/Owner/Repo/pull/17/files");
		expect(f.state.pushes.at(-1)).toEqual({
			pathname: "/workspace/[id]/pull-request/[pullRequestId]",
			params: {
				id: "workspace",
				pullRequestId: "17",
				owner: "Owner",
				repo: "Repo",
				provider: "github",
			},
		});
	});
	test("unsupported native subpath stays external", async () => {
		await f.render(Probe);
		open(`${f.nativeUrl}/diffs`);
		expect(f.state.externals.at(-1)).toBe(`${f.nativeUrl}/diffs`);
	});
	test("native link without workspace stays external", async () => {
		function NoWorkspace() {
			open = useOpenLink();
			return null;
		}
		await f.render(NoWorkspace);
		open(f.nativeUrl);
		expect(f.state.pushes).toHaveLength(0);
		expect(f.state.externals).toEqual([f.nativeUrl]);
	});
}
