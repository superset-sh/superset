import { expect, test } from "bun:test";
import { TRPCClientError } from "@trpc/client";
import { getBranchLoadFailure } from "./getBranchLoadFailure";

const hostError = (data: Record<string, unknown>) =>
	TRPCClientError.from({
		error: {
			message: "Project directory is no longer a directory on disk",
			code: -32004,
			data,
		},
	});

test("names a missing project folder from the host's error data", () => {
	expect(
		getBranchLoadFailure(
			hostError({
				code: "NOT_FOUND",
				projectDirMissing: {
					kind: "PROJECT_DIR_MISSING",
					repoPath: "/code/acme-web",
				},
			}),
		),
	).toEqual({ kind: "project-dir-missing", repoPath: "/code/acme-web" });
});

test("treats a relay or transport failure as an unreachable host", () => {
	expect(getBranchLoadFailure(hostError({ code: "BAD_GATEWAY" }))).toEqual({
		kind: "host-unreachable",
	});
	expect(
		getBranchLoadFailure(
			TRPCClientError.from(new TypeError("Failed to fetch")),
		),
	).toEqual({ kind: "host-unreachable" });
});

test("falls back to unknown for a host that does not send the folder tag", () => {
	expect(getBranchLoadFailure(hostError({ code: "NOT_FOUND" }))).toEqual({
		kind: "unknown",
	});
	expect(getBranchLoadFailure(null)).toEqual({ kind: "unknown" });
});
