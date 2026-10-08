import { afterEach, describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render } from "@testing-library/react";
import type { ComponentProps } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { V2ProjectSettingsBody } from "./V2ProjectSettingsBody";

(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(cleanup);

type BodyProps = ComponentProps<typeof V2ProjectSettingsBody>;

const HOST_URL = "http://127.0.0.1:7777";

const project: BodyProps["project"] = {
	projectKey: "project-1",
	id: "project-1",
	name: "Acme",
	repoOwner: "acme",
	repoName: "app",
	repoUrl: "https://github.com/acme/app",
	icon: null,
	color: null,
	hostIds: ["host-1"],
	hostReachable: true,
	createdAt: 1,
	updatedAt: 1,
};

const hostProject = {
	id: "project-1",
	name: "Acme",
	icon: null,
	color: null,
	repoPath: "/repos/app",
	worktreeBaseDir: null,
	branchPrefixMode: null,
	branchPrefixCustom: null,
	namingInstructions: "Prefix branches with fix/ or feat/",
	sparseCheckoutPaths: ["apps/desktop"],
} as unknown as NonNullable<BodyProps["hostProject"]>;

function renderBody(props: Partial<BodyProps> = {}) {
	const queryClient = new QueryClient();
	return render(
		<electronTrpc.Provider
			client={electronTrpc.createClient({ links: [] })}
			queryClient={queryClient}
		>
			<QueryClientProvider client={queryClient}>
				<V2ProjectSettingsBody
					projectId="project-1"
					project={project}
					hostProject={hostProject}
					targetHostUrl={HOST_URL}
					targetHostId="host-1"
					targetHostName="This device"
					isRemoteTarget={false}
					isHostOnline
					hostOptions={[]}
					onHostChange={() => {}}
					onHostProjectChanged={() => {}}
					locationSection={<div data-testid="location" />}
					scriptsEditor={<div data-testid="scripts" />}
					dangerZone={<div data-testid="danger" />}
					{...props}
				/>
			</QueryClientProvider>
		</electronTrpc.Provider>,
	);
}

describe("V2ProjectSettingsBody", () => {
	test("offers the project icon picker so users can set an icon (#5843)", () => {
		const view = renderBody();
		expect(view.getByLabelText("Change project icon and color")).toHaveProperty(
			"disabled",
			false,
		);
	});

	test("seeds the naming-instructions editor from the targeted host row", () => {
		const view = renderBody();
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-naming-instructions",
			)?.value,
		).toBe("Prefix branches with fix/ or feat/");
	});

	test("seeds the sparse-checkout editor from the targeted host row", () => {
		const view = renderBody();
		expect(
			view.container.querySelector<HTMLTextAreaElement>(
				"#project-sparse-checkout",
			)?.value,
		).toBe("apps/desktop");
	});

	test("hides the host-backed editors until the host row has loaded", () => {
		const view = renderBody({ hostProject: undefined });
		expect(view.container.querySelector("#project-naming-instructions")).toBe(
			null,
		);
		expect(view.container.querySelector("#project-sparse-checkout")).toBe(null);
		expect(view.getByLabelText("Change project icon and color")).toBeDefined();
	});

	test("places the location, scripts and danger-zone sections it is given", () => {
		const view = renderBody();
		for (const slot of ["location", "scripts", "danger"]) {
			expect(view.getByTestId(slot)).toBeDefined();
		}
	});
});
