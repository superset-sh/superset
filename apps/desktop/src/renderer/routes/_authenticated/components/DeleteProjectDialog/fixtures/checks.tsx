import { afterEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";

if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
(
	globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let isOwner = false;
let remoteOnline = true;
let localReachable = true;
let failShared = false;
let revoked = false;
const requests: string[] = [];
mock.module("renderer/lib/auth-client", () => ({
	authClient: { useSession: () => ({ data: { user: { id: "member" } } }) },
}));
mock.module("renderer/lib/cloud-trpc", () => ({
	cloudTrpc: {
		host: {
			listMembers: {
				useQuery: () => ({
					data: [
						{
							hostId: "personal",
							userId: "member",
							role: revoked ? "member" : "owner",
						},
						{ hostId: "shared", userId: "member", role: "member" },
					],
				}),
			},
		},
	},
}));
mock.module(
	"renderer/routes/_authenticated/hooks/useIsOrganizationOwner",
	() => ({ useIsOrganizationOwner: () => isOwner }),
);
mock.module("renderer/hooks/host-service/useHostTargetUrl", () => ({
	useHostUrls: (ids: string[]) =>
		ids.map((hostId) => ({
			hostId,
			url: hostId === "personal" && !localReachable ? null : hostId,
			isLocal: hostId === "personal",
		})),
}));
mock.module("renderer/hooks/known-hosts/useKnownHosts", () => ({
	useKnownHosts: () => ({
		hosts: [
			{ machineId: "personal", name: "Personal", isOnline: false },
			{ machineId: "shared", name: "Shared", isOnline: remoteOnline },
		],
	}),
}));
mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: (url: string) => ({
		project: {
			remove: {
				mutate: async () => {
					requests.push(url);
					if (url === "shared" && failShared)
						throw new Error("Remote rejected deletion");
				},
			},
		},
	}),
}));
mock.module("@superset/ui/sonner", () => ({
	toast: { error: mock(), success: mock(), warning: mock() },
}));
const { act, cleanup, renderHook, render } = await import(
	"@testing-library/react"
);
const { useDeleteProject } = await import("../useDeleteProject");
afterEach(() => {
	cleanup();
	requests.length = 0;
	isOwner = false;
	remoteOnline = true;
	localReachable = true;
	failShared = false;
	revoked = false;
});

test("member confirmation counts and mutation exclude shared devices", async () => {
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal", "shared"],
		}),
	);
	expect(result.current.selectedHostIds).toEqual(["personal"]);
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(true);
	});
	expect(requests).toEqual(["personal"]);
});
test("organization owner retains multi-device deletion", async () => {
	isOwner = true;
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal", "shared"],
			selectedHostIds: ["personal", "shared"],
		}),
	);
	expect(result.current.selectedHostIds).toEqual(["personal", "shared"]);
	await act(async () => {
		await result.current.deleteProject();
	});
	expect(requests).toEqual(["personal", "shared"]);
});
test("member with no owned serving device sends no deletion", async () => {
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["shared"],
		}),
	);
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(false);
	});
	expect(requests).toEqual([]);
});

test("an owner does not delete remote copies by default", async () => {
	isOwner = true;
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal", "shared"],
		}),
	);
	await act(async () => {
		await result.current.deleteProject();
	});
	expect(requests).toEqual(["personal"]);
});
test("offline remote remains excluded even with a relay URL and explicit selection", async () => {
	isOwner = true;
	remoteOnline = false;
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["shared"],
			selectedHostIds: ["shared"],
		}),
	);
	expect(result.current.targets[0]?.isOnline).toBe(false);
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(false);
	});
	expect(requests).toEqual([]);
});
test("revoking host ownership while open prevents the selected deletion", async () => {
	const { result, rerender } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal"],
			selectedHostIds: ["personal"],
		}),
	);
	revoked = true;
	rerender();
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(false);
	});
	expect(requests).toEqual([]);
});
test("partial failure keeps confirmation open and does not navigate away", async () => {
	isOwner = true;
	failShared = true;
	const onDeleted = mock();
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal", "shared"],
			selectedHostIds: ["personal", "shared"],
			onDeleted,
		}),
	);
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(false);
	});
	expect(requests).toEqual(["personal", "shared"]);
	expect(onDeleted).not.toHaveBeenCalled();
});
test("a remote-only owned project can be deleted without a local copy", async () => {
	isOwner = true;
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["shared"],
		}),
	);
	await act(async () => {
		expect(await result.current.deleteProject()).toBe(true);
	});
	expect(requests).toEqual(["shared"]);
});

test("double submission sends one deletion per device", async () => {
	const { result } = renderHook(() =>
		useDeleteProject({
			projectId: "project",
			projectName: "Project",
			hostIds: ["personal"],
		}),
	);
	await act(async () => {
		const first = result.current.deleteProject();
		const second = result.current.deleteProject();
		expect(await first).toBe(true);
		expect(await second).toBe(false);
	});
	expect(requests).toEqual(["personal"]);
});

const { DeleteProjectDialog } = await import("../DeleteProjectDialog");
test("an open dialog never retargets when the selected local device disconnects", () => {
	isOwner = true;
	const props = {
		open: true,
		onOpenChange: () => {},
		projectId: "project",
		projectName: "Project",
		hostIds: ["personal", "shared"],
	};
	const view = render(<DeleteProjectDialog {...props} />);
	expect(
		view
			.getByRole("checkbox", { name: "Personal" })
			.getAttribute("aria-checked"),
	).toBe("true");
	expect(
		view.getByRole("checkbox", { name: "Shared" }).getAttribute("aria-checked"),
	).toBe("false");
	localReachable = false;
	view.rerender(<DeleteProjectDialog {...props} />);
	expect(
		view.getByRole("checkbox", { name: "Shared" }).getAttribute("aria-checked"),
	).toBe("false");
	expect(
		(
			view.getByRole("button", {
				name: "Delete",
			}) as HTMLButtonElement
		).disabled,
	).toBe(true);
});
