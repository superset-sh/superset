import { beforeEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { SignJWT } from "jose";
import {
	connectionId,
	isolatedGitlabHookTests,
	setupGitlabHookFixture,
} from "../../hook-test-fixture.test";

if (process.env.SUPERSET_GITLAB_HOOK_FIXTURE === "job") {
	const { fixture, reset } = await setupGitlabHookFixture();
	const { POST } = await import("./route");
	beforeEach(reset);
	const url = `${fixture.environment.NEXT_PUBLIC_API_URL}/api/gitlab/jobs/reconcile-hooks`;
	async function signed(
		options: {
			key?: string;
			body?: string;
			signedBody?: string;
			signedUrl?: string;
		} = {},
	) {
		const body = options.body ?? "{}";
		const signature = await new SignJWT({
			body: createHash("sha256")
				.update(options.signedBody ?? body)
				.digest("base64url"),
		})
			.setProtectedHeader({ alg: "HS256" })
			.setIssuer("Upstash")
			.setSubject(options.signedUrl ?? url)
			.setExpirationTime("5m")
			.sign(
				new TextEncoder().encode(
					options.key ?? fixture.environment.QSTASH_CURRENT_SIGNING_KEY,
				),
			);
		return new Request(url, {
			method: "POST",
			headers: { "upstash-signature": signature },
			body,
		});
	}
	test("actual central QStash auth binds signature, URL and body before any DB access", async () => {
		for (const request of [
			new Request(url, { method: "POST", body: "{}" }),
			await signed({ key: "wrong-key" }),
			await signed({ signedUrl: `${url}/wrong` }),
			await signed({ body: '{"tampered":true}', signedBody: "{}" }),
		]) {
			expect((await POST(request)).status).toBe(401);
		}
		expect(fixture.selections).toBe(0);
		expect(fixture.reads).toBe(0);
		expect(fixture.calls).toHaveLength(0);
	});
	test("current and next cloud keys reach actual reconciliation and eligible org-only selection", async () => {
		for (const key of [
			fixture.environment.QSTASH_CURRENT_SIGNING_KEY,
			fixture.environment.QSTASH_NEXT_SIGNING_KEY,
		]) {
			expect(
				await (
					await POST(
						await signed({ key, body: JSON.stringify({ connectionId }) }),
					)
				).json(),
			).toEqual({
				connections: 1,
				results: [{ connectionId, status: "reconciled", projects: 1 }],
			});
			if (!fixture.where) throw new Error("Missing selection predicate");
			const query = new PgDialect().sqlToQuery(fixture.where);
			expect(query.sql).toContain('"disconnected_at" is null');
			expect(query.sql).toContain("eligible_sync_policy");
			expect(query.sql).toContain("scopeKind");
			expect(query.params).toEqual(
				expect.arrayContaining(["gitlab", "org", connectionId]),
			);
		}
	});
	test("malformed authenticated payloads never read connections", async () => {
		expect((await POST(await signed({ body: "{bad" }))).status).toBe(400);
		expect(
			(await POST(await signed({ body: '{"connectionId":"not-uuid"}' })))
				.status,
		).toBe(400);
		expect(fixture.selections).toBe(0);
	});
	test("provider failure is isolated and redacted, then a later job recovers", async () => {
		fixture.interceptor = async (_url, init) =>
			init.method
				? new Response("provider-secret-internal", { status: 503 })
				: null;
		const result = await POST(await signed());
		expect(await result.json()).toEqual({
			connections: 1,
			results: [{ connectionId, status: "failed", error: "reconcile_failed" }],
		});
		fixture.interceptor = undefined;
		expect((await (await POST(await signed())).json()).results[0]).toEqual({
			connectionId,
			status: "reconciled",
			projects: 1,
		});
	});
	test("one organization failure does not prevent reconciliation of a later organization", async () => {
		if (!fixture.current) throw new Error("Missing fixture connection");
		const otherId = "00000000-0000-4000-8000-000000000008";
		fixture.additionalRows = [
			{
				...structuredClone(fixture.current),
				id: otherId,
				organizationId: "organization_2",
				state: {
					provider: "gitlab",
					host: "git.example.invalid:8443",
					groupPath: "team/other",
					scopeKind: "project",
					scopeId: "8",
					auth: "token",
					webhookSecret: "FIXTURE_OTHER_HOOK_SECRET",
				},
			},
		];
		fixture.interceptor = async (url, init) => {
			if (url.pathname === "/api/v4/projects/8")
				return Response.json({ id: 8, path_with_namespace: "team/other" });
			return init.method && url.pathname.startsWith("/api/v4/projects/7/")
				? new Response(null, { status: 503 })
				: null;
		};
		expect(await (await POST(await signed())).json()).toEqual({
			connections: 2,
			results: [
				{ connectionId, status: "failed", error: "reconcile_failed" },
				{ connectionId: otherId, status: "reconciled", projects: 1 },
			],
		});
	});
} else {
	test("signed GitLab hook job in an isolated cleared fake-only process", () =>
		isolatedGitlabHookTests(import.meta.path, "job"));
}
