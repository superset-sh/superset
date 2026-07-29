import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Reproduces #5843: "Project icons are missing in 1.16".
 *
 * Nearly all projects now render through the v2 settings page
 * (`V2ProjectSettings`). A fully-built icon picker (`IconUploadField`) exists
 * in the v2 tree with backing tRPC mutations, but it was never wired into
 * `V2ProjectSettings` — so there is no longer any UI to set a project icon.
 *
 * This test renders `V2ProjectSettings` with its data/host dependencies
 * stubbed out and asserts the icon picker is present. Before the fix it fails
 * (the picker is never rendered); after wiring `IconUploadField` in, it passes.
 */

const project = {
	projectKey: "project-1",
	id: "project-1",
	name: "Acme",
	repoOwner: "acme-co",
	repoName: "acme",
	repoUrl: "https://github.com/acme-co/acme",
	hostIds: ["host-1"],
	hostReachable: true,
	createdAt: 0,
	updatedAt: 0,
};

// External data/host dependencies — stubbed so the component renders in a
// plain SSR pass without providers.
mock.module("@tanstack/react-query", () => ({
	useQuery: () => ({ data: null, refetch: () => {} }),
}));
mock.module("@tanstack/react-router", () => ({
	useNavigate: () => () => {},
}));
mock.module("renderer/hooks/host-projects/useHostProjects", () => ({
	useHostProjects: () => ({ projects: [project], isReady: true }),
}));
mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
	useHostUrl: () => null,
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: () => ({}),
}));
mock.module(
	"renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/DashboardNewWorkspaceForm/components/DevicePicker/hooks/useWorkspaceHostOptions",
	() => ({
		useWorkspaceHostOptions: () => ({
			currentDeviceName: "This device",
			localHostId: "host-1",
			otherHosts: [],
		}),
	}),
);
mock.module(
	"renderer/routes/_authenticated/components/ProjectThumbnail",
	() => ({
		ProjectThumbnail: () => null,
	}),
);
mock.module(
	"renderer/routes/_authenticated/providers/LocalHostServiceProvider",
	() => ({
		useLocalHostService: () => ({ machineId: "host-1" }),
	}),
);
mock.module("../../../../components/HostSelect", () => ({
	HostSelect: () => null,
}));

// Sibling sections — irrelevant to this test, stubbed to keep the render light
// and free of their own provider requirements.
mock.module("./components/BranchPrefixSection", () => ({
	BranchPrefixSection: () => null,
}));
mock.module("./components/DeleteProjectSection", () => ({
	DeleteProjectSection: () => null,
}));
mock.module("./components/NameSection", () => ({ NameSection: () => null }));
mock.module("./components/ProjectLocationSection", () => ({
	ProjectLocationSection: () => null,
}));
mock.module("./components/RepositorySection", () => ({
	RepositorySection: () => null,
}));
mock.module("./components/V2ScriptsEditor", () => ({
	V2ScriptsEditor: () => null,
}));
mock.module("./components/WorktreeLocationSection", () => ({
	WorktreeLocationSection: () => null,
}));

// The icon picker itself — stubbed with a recognizable marker so the assertion
// checks the wiring (that V2ProjectSettings renders it) rather than the
// picker's internals.
mock.module("./components/IconUploadField", () => ({
	IconUploadField: ({ projectId }: { projectId: string }) => (
		<div data-testid="project-icon-picker" data-project-id={projectId}>
			icon-picker
		</div>
	),
}));

const { V2ProjectSettings } = await import("./V2ProjectSettings");

describe("V2ProjectSettings", () => {
	test("renders the project icon picker so users can set an icon (#5843)", () => {
		const markup = renderToStaticMarkup(
			<V2ProjectSettings projectId="project-1" hostId="host-1" />,
		);

		expect(markup).toContain('data-testid="project-icon-picker"');
		expect(markup).toContain('data-project-id="project-1"');
	});
});
