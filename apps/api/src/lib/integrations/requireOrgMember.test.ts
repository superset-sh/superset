import { expect, mock, test } from "bun:test";

if (process.env.SUPERSET_GITLAB_ADMIN_FIXTURE === "1") {
	let role: string | null = "member";
	let signedIn = true;
	mock.module("@superset/auth/server", () => ({
		auth: {
			api: {
				getSession: async () => (signedIn ? { user: { id: "user_1" } } : null),
			},
		},
	}));
	mock.module("@superset/db/utils", () => ({
		findOrgMembership: async () => (role ? { role } : null),
	}));
	const { requireOrgMember } = await import("./requireOrgMember");
	const request = new Request(
		"https://api.example.invalid/api/gitlab/connect?organizationId=org_1",
	);
	test("default callers retain member access while organization account changes require admin", async () => {
		role = "member";
		expect(await requireOrgMember(request)).toEqual({
			organizationId: "org_1",
			userId: "user_1",
		});
		const rejected = await requireOrgMember(request, { requireAdmin: true });
		expect(rejected).toBeInstanceOf(Response);
		if (!(rejected instanceof Response))
			throw new Error("Member changed organization account");
		expect(rejected.status).toBe(403);
		for (const allowed of ["admin", "owner"]) {
			role = allowed;
			expect(await requireOrgMember(request, { requireAdmin: true })).toEqual({
				organizationId: "org_1",
				userId: "user_1",
			});
		}
	});
	test("missing membership or session retains ordinary authorization failures", async () => {
		role = null;
		const departed = await requireOrgMember(request, { requireAdmin: true });
		if (!(departed instanceof Response))
			throw new Error("Accepted departed member");
		expect(departed.status).toBe(403);
		signedIn = false;
		const guest = await requireOrgMember(request);
		if (!(guest instanceof Response)) throw new Error("Accepted guest");
		expect(guest.status).toBe(401);
		signedIn = true;
	});
} else {
	test("organization admin authorization with default compatibility", () => {
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "test", import.meta.path],
			{
				cwd: new URL("../../../", import.meta.url).pathname,
				env: {
					PATH: process.env.PATH ?? "",
					TMPDIR: process.env.TMPDIR ?? "/tmp",
					SUPERSET_GITLAB_ADMIN_FIXTURE: "1",
				},
				stdout: "pipe",
				stderr: "pipe",
				timeout: 15_000,
			},
		);
		expect(
			result.exitCode,
			result.stdout.toString() + result.stderr.toString(),
		).toBe(0);
	});
}
