import { afterEach, expect, test } from "bun:test";
import { mobileCloudFixture, runMobileM2Child } from "./testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual cloud selection in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileCloudFixture();
	let output: ReturnType<typeof f.selection.useCloudCreateSelection>;
	function Probe() {
		output = f.selection.useCloudCreateSelection();
		return null;
	}
	afterEach(async () => {
		await f.cleanup();
		f.reset();
	});
	test("native authoritative environment retains project clone and default branch", async () => {
		await f.render(Probe);
		expect(output.environment?.id).toBe("environment-a");
		expect(output.repository).toBeNull();
		expect(output).toHaveProperty("gitlabProject", f.project);
	});
	test("GH selection repository shape remains exact", async () => {
		f.state.environments = [f.githubEnvironment];
		f.preferences.environmentId = "environment-gh";
		await f.render(Probe);
		expect(output.repository).toEqual(f.githubEnvironment.repositories[0]);
	});
	test("native cached failed list withholds create-ready selection", async () => {
		await f.render(Probe);
		f.state.environmentReply = new Error("503");
		await f.React.act(async () => {
			await f.client.invalidateQueries();
		});
		await f.settle();
		expect(output.environment).toBeNull();
		f.preferences.baseBranch = "native-feature";
		await f.render(Probe);
		expect(f.preferences.baseBranch).toBe("native-feature");
	});
}
