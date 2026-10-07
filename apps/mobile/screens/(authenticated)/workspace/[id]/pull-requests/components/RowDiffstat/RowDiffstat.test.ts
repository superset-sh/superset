import { afterEach, expect, test } from "bun:test";
import {
	mobileM2Fixture,
	runMobileM2Child,
} from "../../../../../../../hooks/useOpenLink/testFixture.test";

if (process.env.TEST_MOBILE_M2 !== "1") {
	test(
		"actual mobile consumer in owned child",
		() => runMobileM2Child(import.meta.path),
		30000,
	);
} else {
	const f = await mobileM2Fixture();
	afterEach(f.cleanup);
	const { RowDiffstat } = await import("./RowDiffstat");
	let props = {
		hostUrl: "https://broker.example/org/cloud:workspace",
		pullRequest: f.nativeRow,
		enabled: true,
		workspaceId: "workspace",
		projectId: "project",
	};
	function Probe() {
		return f.React.createElement(RowDiffstat, props);
	}
	test("native diffstat uses rich complete bound endpoint", async () => {
		await f.render(Probe);
		expect(f.state.requests[0]).toEqual({
			url: props.hostUrl,
			method: "getPullRequestDetail",
			input: {
				owner: "Group/Sub",
				repo: "Repo",
				pullNumber: 17,
				provider: "gitlab",
				host: "git.example:8443",
				workspaceId: "workspace",
				projectId: "project",
				expectedUrl: f.nativeUrl,
			},
		});
		expect(document.body.textContent).toBe("+7−2");
	});
	test("native incomplete statistics are hidden", async () => {
		f.state.detail = {
			...f.state.detail,
			pullRequest: { ...f.state.detail.pullRequest, diffStatsComplete: false },
		};
		await f.render(Probe);
		expect(document.body.textContent).toBe("");
	});
	test("wrong native response identity is hidden", async () => {
		f.state.detail = { ...f.state.detail, host: "other.example" };
		await f.render(Probe);
		expect(document.body.textContent).toBe("");
	});
	test("missing selected native project cannot query", async () => {
		props = { ...props, projectId: "" };
		await f.render(Probe);
		expect(f.state.requests).toHaveLength(0);
		expect(document.body.textContent).toBe("");
	});
	test("GH retains getPR exact payload and output", async () => {
		props = { ...props, pullRequest: f.githubRow, projectId: "project" };
		await f.render(Probe);
		expect(f.state.requests.at(-1)).toEqual({
			url: props.hostUrl,
			method: "getPR",
			input: { owner: "Owner", repo: "Repo", pullNumber: 17 },
		});
		expect(document.body.textContent).toBe("+4−1");
	});
	test("wrong native returned IID is hidden", async () => {
		props = { ...props, pullRequest: f.nativeRow };
		f.state.detail = {
			...f.state.detail,
			pullRequest: { ...f.state.detail.pullRequest, number: 18 },
		};
		await f.render(Probe);
		expect(document.body.textContent).toBe("");
	});
	test("wrong native returned URL is hidden", async () => {
		props = { ...props, pullRequest: f.nativeRow };
		f.state.detail = {
			...f.state.detail,
			pullRequest: {
				...f.state.detail.pullRequest,
				url: f.nativeUrl.replace("Group", "group"),
			},
		};
		await f.render(Probe);
		expect(document.body.textContent).toBe("");
	});
	test("changed selected native project cannot expose cached counts", async () => {
		props = { ...props, pullRequest: f.nativeRow, projectId: "project" };
		await f.render(Probe);
		expect(document.body.textContent).toBe("+7−2");
		f.state.deferred = new Promise(() => {});
		props = { ...props, projectId: "other" };
		await f.render(Probe);
		expect(document.body.textContent).toBe("");
	});
}
