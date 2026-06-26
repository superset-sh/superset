import { describe, expect, mock, test } from "bun:test";
import {
	handleInviteMember,
	type InviteMemberArgs,
	type InviteMemberResponse,
} from "./handleInviteMember";

function makeDeps(overrides: {
	response?: InviteMemberResponse;
	throwError?: Error;
	currentUserRole?: "owner" | "admin" | "member";
}) {
	const onSuccess = mock<(message: string) => void>(() => {});
	const onError = mock<(message: string) => void>(() => {});
	const inviteMember = mock<
		(args: InviteMemberArgs) => Promise<InviteMemberResponse>
	>(async () => {
		if (overrides.throwError) throw overrides.throwError;
		return (
			overrides.response ?? {
				data: { id: "inv-1" },
				error: null,
			}
		);
	});

	return {
		inviteMember,
		onSuccess,
		onError,
		currentUserRole: overrides.currentUserRole ?? "owner",
	};
}

const args: InviteMemberArgs = {
	organizationId: "org-1",
	email: "newhire@example.com",
	role: "member",
};

describe("handleInviteMember", () => {
	test("shows error toast when better-auth client resolves with an error payload", async () => {
		// Reproduces #4556: the better-auth client resolves with
		// { data: null, error: { ... } } on HTTP failures rather than throwing.
		// Before the fix, the caller only watched `try/catch`, so the user saw
		// a success toast even though the invitation was never created.
		const deps = makeDeps({
			response: {
				data: null,
				error: {
					message: "USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
					status: 400,
					statusText: "Bad Request",
				},
			},
		});

		const success = await handleInviteMember(args, deps);

		expect(success).toBe(false);
		expect(deps.onError).toHaveBeenCalledTimes(1);
		expect(deps.onError).toHaveBeenCalledWith(
			"USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION",
		);
		expect(deps.onSuccess).not.toHaveBeenCalled();
	});

	test("falls back to a generic message when the server error has no message", async () => {
		const deps = makeDeps({
			response: {
				data: null,
				error: { status: 500, statusText: "Internal Server Error" },
			},
		});

		await handleInviteMember(args, deps);

		expect(deps.onError).toHaveBeenCalledWith("Failed to send invitation");
		expect(deps.onSuccess).not.toHaveBeenCalled();
	});

	test("shows success toast when the invitation is created", async () => {
		const deps = makeDeps({
			response: { data: { id: "inv-1" }, error: null },
		});

		const success = await handleInviteMember(args, deps);

		expect(success).toBe(true);
		expect(deps.onSuccess).toHaveBeenCalledWith(
			"Invitation sent to newhire@example.com",
		);
		expect(deps.onError).not.toHaveBeenCalled();
	});

	test("surfaces thrown network errors as error toasts", async () => {
		const deps = makeDeps({
			throwError: new Error("Network request failed"),
		});

		const success = await handleInviteMember(args, deps);

		expect(success).toBe(false);
		expect(deps.onError).toHaveBeenCalledWith("Network request failed");
		expect(deps.onSuccess).not.toHaveBeenCalled();
	});

	test("rejects roles the current user is not allowed to invite without hitting the network", async () => {
		const deps = makeDeps({ currentUserRole: "member" });

		const success = await handleInviteMember({ ...args, role: "owner" }, deps);

		expect(success).toBe(false);
		expect(deps.inviteMember).not.toHaveBeenCalled();
		expect(deps.onError).toHaveBeenCalledWith("Cannot invite users as Owner");
	});
});
