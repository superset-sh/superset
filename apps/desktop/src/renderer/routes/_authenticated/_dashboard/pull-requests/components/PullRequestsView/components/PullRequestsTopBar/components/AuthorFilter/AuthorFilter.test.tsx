import { afterAll, afterEach, expect, spyOn, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { act, cleanup, fireEvent, render, within, waitFor } = await import(
	"@testing-library/react"
);
const { QueryClient, QueryClientProvider } = await import(
	"@tanstack/react-query"
);
const { useState } = await import("react");
const { AuthorFilter } = await import("./AuthorFilter");

afterEach(cleanup);
afterAll(async () => {
	if (!alreadyRegistered) await GlobalRegistrator.unregister();
});

function FilterHarness() {
	const [value, setValue] = useState<string | null>(null);
	return <AuthorFilter value={value} onChange={setValue} projectTargets={[]} />;
}

test("selects multiple custom authors, retains them on reopen, and toggles or clears them", async () => {
	const client = new QueryClient();
	render(
		<QueryClientProvider client={client}>
			<FilterHarness />
		</QueryClientProvider>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: All authors" }));
	});
	for (const login of ["alice", "bob"]) {
		await act(async () => {
			fireEvent.change(page.getByRole("combobox"), {
				target: { value: login },
			});
		});
		await act(async () => {
			fireEvent.click(
				page.getByRole("option", { name: `Filter by @${login}` }),
			);
		});
		expect(page.getByRole("dialog")).toBeTruthy();
		expect(
			page.getByRole("option", { name: login }).getAttribute("aria-checked"),
		).toBe("true");
	}
	expect(
		page.getByRole("button", { name: "Author: @alice, @bob" }),
	).toBeTruthy();
	await act(async () => {
		fireEvent.keyDown(page.getByRole("combobox"), {
			key: "Escape",
			code: "Escape",
		});
	});
	expect(page.queryByRole("dialog")).toBeNull();
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: @alice, @bob" }));
	});
	expect(
		page.getByRole("option", { name: "alice" }).getAttribute("aria-checked"),
	).toBe("true");
	expect(
		page.getByRole("option", { name: "bob" }).getAttribute("aria-checked"),
	).toBe("true");
	await act(async () => {
		fireEvent.click(page.getByRole("option", { name: "alice" }));
	});
	expect(page.getByRole("button", { name: "Author: @bob" })).toBeTruthy();
	await act(async () => {
		fireEvent.click(page.getByRole("option", { name: "All authors" }));
	});
	expect(
		page.getByRole("button", { name: "Author: All authors" }),
	).toBeTruthy();
	expect(
		page
			.getByRole("option", { name: "All authors" })
			.getAttribute("aria-checked"),
	).toBe("true");
	client.clear();
});

test("native plaintext accepts underscore author without contributor or GitHub-avatar lookup", async () => {
	const host = await import("renderer/lib/host-service-client");
	let calls = 0;
	const denied = spyOn(host, "getHostServiceClientByUrl").mockImplementation(
		() => {
			calls++;
			throw new Error("Native plaintext must not call GitHub contributors");
		},
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	const selected: { value: string | null } = { value: null };
	render(
		<QueryClientProvider client={client}>
			<AuthorFilter
				value={null}
				onChange={(value) => {
					selected.value = value;
				}}
				projectTargets={[
					{
						projectId: "gl",
						projectName: "Native",
						hostId: "native",
						hostUrl: "http://fixture.invalid",
					},
				]}
				searchSelection={{
					mode: "gitlab",
					ready: true,
					hasGitlab: true,
					approvalRules: false,
				}}
			/>
		</QueryClientProvider>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: All authors" }));
	});
	await act(async () => {
		fireEvent.change(page.getByRole("combobox"), {
			target: { value: "native_user" },
		});
	});
	await act(async () => {
		fireEvent.click(
			page.getByRole("option", { name: "Filter by @native_user" }),
		);
	});
	expect(selected.value).toBe("native_user");
	expect(calls).toBe(0);
	expect(document.querySelector('img[src^="https://github.com/"]')).toBeNull();
	denied.mockRestore();
	client.clear();
});

test("native mode does not reuse a cached GitHub contributor roster", async () => {
	const client = new QueryClient();
	client.setQueryData(
		["pullRequests", "repoContributors", "gl", "http://fixture.invalid"],
		[{ login: "old-github-user" }],
	);
	render(
		<QueryClientProvider client={client}>
			<AuthorFilter
				value="native_user"
				onChange={() => {}}
				projectTargets={[
					{
						projectId: "gl",
						projectName: "Native",
						hostId: "native",
						hostUrl: "http://fixture.invalid",
					},
				]}
				searchSelection={{
					mode: "gitlab",
					ready: true,
					hasGitlab: true,
					approvalRules: false,
				}}
			/>
		</QueryClientProvider>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: @native_user" }));
	});
	expect(page.queryByRole("option", { name: "old-github-user" })).toBeNull();
	expect(page.getByRole("option", { name: "native_user" })).toBeTruthy();
	client.clear();
});

test("known GitHub controls keep their original scoped contributor request", async () => {
	const host = await import("renderer/lib/host-service-client");
	const requests: unknown[] = [];
	const fixture = {
		workspaceCreation: {
			getRepoContributors: {
				query: async (input: unknown) => {
					requests.push(input);
					return [{ login: "octocat" }];
				},
			},
		},
	};
	const boundary = spyOn(host, "getHostServiceClientByUrl").mockImplementation(
		(url) => {
			expect(url).toBe("http://github-fixture.invalid");
			return fixture as unknown as ReturnType<
				typeof host.getHostServiceClientByUrl
			>;
		},
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<AuthorFilter
				value={null}
				onChange={() => {}}
				projectTargets={[
					{
						projectId: "gh",
						projectName: "GitHub",
						hostId: "gh",
						hostUrl: "http://github-fixture.invalid",
					},
				]}
				searchSelection={{
					mode: "github",
					ready: true,
					hasGitlab: false,
					approvalRules: true,
				}}
			/>
		</QueryClientProvider>,
	);
	const page = within(document.body);
	await act(async () => {
		fireEvent.click(page.getByRole("button", { name: "Author: All authors" }));
	});
	await waitFor(() =>
		expect(page.getByRole("option", { name: "octocat" })).toBeTruthy(),
	);
	expect(requests).toEqual([{ projectId: "gh" }]);
	boundary.mockRestore();
	client.clear();
});
