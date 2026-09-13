import { afterAll, afterEach, beforeEach, expect, mock, test } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { TRPCClientError } from "@trpc/client";
import type { WorkspaceHostTarget } from "../useWorkspaceHostUrl";

const success = {
	success: true,
	worktreeRemoved: true,
	branchDeleted: false,
	cloudDeleted: false,
	warnings: ["cleanup warning"],
};
const archive = mock(async () => success);
const destroy = mock(async () => success);
const revive = mock(async () => ({ warnings: ["restore warning"] }));
const invalidateHost = mock(() => {});
const getClient = mock((_url: string) => ({
	workspaceCleanup: {
		archive: { mutate: archive },
		destroy: { mutate: destroy },
		revive: { mutate: revive },
	},
}));
const normalizeError = mock((error: unknown) => ({
	kind: "unknown",
	message: error instanceof Error ? error.message : String(error),
}));

mock.module("renderer/lib/host-service-client", () => ({
	getHostServiceClientByUrl: getClient,
}));
mock.module(
	"renderer/routes/_authenticated/providers/HostWorkspacesProvider",
	() => ({ useHostWorkspaces: () => ({ cache: { invalidateHost } }) }),
);
mock.module("../useWorkspaceHostUrl", () => ({
	useWorkspaceHostTarget: () => target,
}));
mock.module("../useDestroyWorkspace", () => ({
	normalizeDestroyWorkspaceError: normalizeError,
}));

const target: WorkspaceHostTarget = {
	status: "ready",
	kind: "remote",
	url: "http://paired-host:4321",
	hostId: "paired-host",
};
const alreadyRegistered = GlobalRegistrator.isRegistered;
if (!alreadyRegistered) GlobalRegistrator.register();
const { cleanup, renderHook } = await import("@testing-library/react");
const { useArchiveWorkspaceWithTarget } = await import("./useArchiveWorkspace");

beforeEach(() => {
	archive.mockReset();
	archive.mockResolvedValue(success);
	destroy.mockClear();
	getClient.mockClear();
	invalidateHost.mockClear();
	normalizeError.mockClear();
});
afterEach(cleanup);
afterAll(() => {
	if (!alreadyRegistered) GlobalRegistrator.unregister();
});

test("archives at the owning host and preserves warnings and restore invalidation", async () => {
	const { result } = renderHook(() =>
		useArchiveWorkspaceWithTarget("workspace-1", target),
	);
	await expect(result.current.archive()).resolves.toEqual(success);
	expect(getClient).toHaveBeenCalledWith(target.url);
	expect(archive).toHaveBeenCalledWith({ workspaceId: "workspace-1" });
	expect(destroy).not.toHaveBeenCalled();
	await expect(result.current.restore()).resolves.toEqual({
		warnings: ["restore warning"],
	});
	expect(invalidateHost).toHaveBeenCalledWith("paired-host");
});

test("older hosts reject archive without falling back to destroy", async () => {
	const error = TRPCClientError.from({
		error: {
			message: 'No procedure found on path "workspaceCleanup.archive"',
			code: -32004,
			data: { code: "NOT_FOUND", httpStatus: 404 },
		},
	});
	archive.mockRejectedValue(error);
	const { result } = renderHook(() =>
		useArchiveWorkspaceWithTarget("workspace-1", target),
	);
	await expect(result.current.archive()).rejects.toEqual({
		kind: "unknown",
		message: "This host needs an update",
	});
	expect(archive).toHaveBeenCalledTimes(1);
	expect(destroy).not.toHaveBeenCalled();
	expect(invalidateHost).not.toHaveBeenCalled();
});

test("ordinary failures retain the existing error normalization", async () => {
	const error = new Error("Workspace not found");
	archive.mockRejectedValue(error);
	const { result } = renderHook(() =>
		useArchiveWorkspaceWithTarget("workspace-1", target),
	);
	await expect(result.current.archive()).rejects.toEqual({
		kind: "unknown",
		message: error.message,
	});
	expect(normalizeError).toHaveBeenCalledWith(error);
	expect(destroy).not.toHaveBeenCalled();
});

test("an unavailable owning host never calls a cleanup endpoint", async () => {
	const { result } = renderHook(() =>
		useArchiveWorkspaceWithTarget("workspace-1", { status: "not-found" }),
	);
	await expect(result.current.archive()).rejects.toEqual({
		kind: "host-unavailable",
		reason: "not-found",
	});
	expect(getClient).not.toHaveBeenCalled();
	expect(destroy).not.toHaveBeenCalled();
});
