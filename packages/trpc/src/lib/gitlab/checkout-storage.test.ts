import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	cloudWorkspaces,
	environments as environmentTable,
} from "@superset/db/schema";
import {
	connectionFixture,
	fixtureUrl,
} from "./connection.fixture.integration";
import type { GitlabCheckout } from "./types";

describe.skipIf(!fixtureUrl)(
	"native scoped GitLab checkout persistence",
	() => {
		let fixture: Awaited<ReturnType<typeof connectionFixture>>;
		let checkouts: typeof import("./checkout");
		let environments: typeof import("./environment-project");
		const ready = fixtureUrl
			? connectionFixture().then(async (f) => {
					fixture = f;
					checkouts = await import("./checkout");
					environments = await import("./environment-project");
				})
			: Promise.resolve();
		afterAll(async () => {
			await ready;
			await fixture?.close();
		});
		async function account() {
			await ready;
			const row = await fixture.seed({
				state: {
					provider: "gitlab",
					host: "gitlab.com",
					groupPath: "Team",
					scopeKind: "group",
					auth: "token",
					webhookSecret: "FAKE_HOOK",
				},
			});
			const project: GitlabCheckout = {
				connectionId: row.id,
				projectId: "37",
				pathWithNamespace: "Team/Widget",
				cloneUrl: "https://gitlab.com/Team/Widget.git",
				defaultBranch: "main",
			};
			return { row, project };
		}
		async function workspace(
			organizationId: string,
			userId: string,
			visibility: "org" | "just_me" = "org",
		) {
			const id = randomUUID();
			const environmentId = await environment(organizationId);
			await fixture.db.insert(cloudWorkspaces).values({
				id,
				organizationId,
				createdByUserId: userId,
				visibility,
				environmentId,
				name: "Fixture workspace",
				branch: "fixture/branch",
				baseBranch: "main",
				providerSandboxId: `fixture-${id}`,
			});
			return id;
		}
		async function environment(organizationId: string) {
			const id = randomUUID();
			await fixture.db.insert(environmentTable).values({
				id,
				organizationId,
				name: "Fixture environment",
				sourceKind: "image",
				sourceRef: "fixture:image",
			});
			return id;
		}
		test("valid project snapshots upsert while workspace and environment metadata retain independent branches", async () => {
			const { row, project } = await account();
			const id = await workspace(row.organizationId, row.connectedByUserId);
			const env = await environment(row.organizationId);
			await checkouts.recordGitlabProject(row.organizationId, project);
			await checkouts.recordGitlabProject(row.organizationId, {
				...project,
				defaultBranch: "trunk",
			});
			const stored =
				await fixture.client`select * from gitlab_cloud_projects where connection_id=${row.id}`;
			expect(stored.length).toBe(1);
			expect(stored[0]?.default_branch).toBe("trunk");
			await checkouts.recordGitlabCheckout({
				cloudWorkspaceId: id,
				organizationId: row.organizationId,
				project,
			});
			expect(
				await checkouts.loadGitlabCheckout(id, row.organizationId),
			).toEqual(project);
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: env,
				organizationId: row.organizationId,
				project: { ...project, defaultBranch: "release" },
			});
			expect(
				await environments.loadGitlabEnvironmentProject(
					env,
					row.organizationId,
				),
			).toEqual({ ...project, defaultBranch: "release" });
		});
		test("writes deny foreign parent organizations, stale connections and unapproved metadata", async () => {
			const { row, project } = await account();
			const foreign = await fixture.identity();
			const w = await workspace(foreign.organizationId, foreign.userId);
			const e = await environment(foreign.organizationId);
			await expect(
				checkouts.recordGitlabProject(foreign.organizationId, project),
			).rejects.toThrow("unavailable");
			await expect(
				checkouts.recordGitlabCheckout({
					cloudWorkspaceId: w,
					organizationId: row.organizationId,
					project,
				}),
			).rejects.toThrow("unavailable");
			await expect(
				environments.setGitlabEnvironmentProject(fixture.db, {
					environmentId: e,
					organizationId: row.organizationId,
					project,
				}),
			).rejects.toThrow("unavailable");
			for (const invalid of [
				{ ...project, cloneUrl: "https://other.invalid/Team/Widget.git" },
				{ ...project, pathWithNamespace: "Other/Widget" },
				{ ...project, projectId: "1e2" },
			])
				await expect(
					checkouts.recordGitlabProject(row.organizationId, invalid),
				).rejects.toThrow("Invalid");
			await fixture.client`update connections set disconnected_at=now() where id=${row.id}`;
			await expect(
				checkouts.recordGitlabProject(row.organizationId, project),
			).rejects.toThrow("unavailable");
			expect(
				(
					await fixture.client`select * from gitlab_cloud_projects where connection_id=${row.id}`
				).length,
			).toBe(0);
		});
		test("a connection change after validation cannot commit a stale project or binding", async () => {
			const { row, project } = await account();
			let calls = 0;
			const executor = {
				execute: async (query: Parameters<typeof fixture.db.execute>[0]) => {
					const result = await fixture.db.execute(query);
					if (++calls === 1)
						await fixture.client`update connections set state=${JSON.stringify({ ...row.state, groupPath: "Other" })}::jsonb where id=${row.id}`;
					return result;
				},
			};
			await expect(
				checkouts.recordGitlabProject(row.organizationId, project, executor),
			).rejects.toThrow("unavailable");
			expect(
				(
					await fixture.client`select * from gitlab_cloud_projects where connection_id=${row.id}`
				).length,
			).toBe(0);
		});
		test("reads preserve visibility and tenant boundaries even for corrupt legacy cross-tenant bindings", async () => {
			const { row, project } = await account();
			const other = await fixture.identity();
			const privateId = await workspace(
				row.organizationId,
				row.connectedByUserId,
				"just_me",
			);
			const orgId = await workspace(row.organizationId, row.connectedByUserId);
			const foreignId = await workspace(other.organizationId, other.userId);
			for (const id of [privateId, orgId])
				await checkouts.recordGitlabCheckout({
					cloudWorkspaceId: id,
					organizationId: row.organizationId,
					project,
				});
			expect(
				await checkouts.loadGitlabCheckout(orgId, other.organizationId),
			).toBeNull();
			expect(
				(
					await checkouts.listGitlabCheckouts(row.organizationId, other.userId)
				).map((x) => x.cloudWorkspaceId),
			).toEqual([orgId]);
			expect(
				(
					await checkouts.listGitlabCheckouts(
						row.organizationId,
						row.connectedByUserId,
					)
				).length,
			).toBe(2);
			await fixture.client`insert into gitlab_workspace_checkouts(cloud_workspace_id,connection_id,project_id,path_with_namespace,clone_url,default_branch)values(${foreignId},${row.id},${project.projectId},${project.pathWithNamespace},${project.cloneUrl},${project.defaultBranch})`;
			expect(
				await checkouts.loadGitlabCheckout(foreignId, other.organizationId),
			).toBeNull();
			expect(
				await checkouts.listGitlabCheckouts(other.organizationId, other.userId),
			).toEqual([]);
			const env = await environment(other.organizationId);
			await fixture.client`insert into gitlab_environment_projects(environment_id,connection_id,project_id,path_with_namespace,clone_url,default_branch)values(${env},${row.id},${project.projectId},${project.pathWithNamespace},${project.cloneUrl},${project.defaultBranch})`;
			expect(
				await environments.loadGitlabEnvironmentProject(
					env,
					other.organizationId,
				),
			).toBeNull();
		});
		test("environment removal is scoped and missing schema never pretends to be a GitHub checkout", async () => {
			const { row, project } = await account();
			const env = await environment(row.organizationId);
			const foreign = await fixture.identity();
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: env,
				organizationId: row.organizationId,
				project,
			});
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: env,
				organizationId: foreign.organizationId,
				project: null,
			});
			expect(
				await environments.loadGitlabEnvironmentProject(
					env,
					row.organizationId,
				),
			).toEqual(project);
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: env,
				organizationId: row.organizationId,
				project: null,
			});
			expect(
				await environments.loadGitlabEnvironmentProject(
					env,
					row.organizationId,
				),
			).toBeNull();
			const missing = {
				execute: async () => {
					throw new Error("gitlab_workspace_checkouts does not exist");
				},
			};
			await expect(
				checkouts.loadGitlabCheckout(randomUUID(), row.organizationId, missing),
			).rejects.toThrow("does not exist");
		});
		test("clone wrapper rejects foreign host and scope before token validation and uses selected account", async () => {
			const { row } = await account();
			let calls = 0;
			const send = async (_origin: string, _token: string, path: string) => {
				calls++;
				return path === "/user"
					? Response.json({ id: 17 })
					: Response.json({
							id: 37,
							path_with_namespace: "Team/Widget",
							http_url_to_repo: "https://gitlab.com/Team/Widget.git",
							default_branch: "main",
						});
			};
			await expect(
				checkouts.resolveGitlabClone(
					{
						organizationId: row.organizationId,
						cloneUrl: "https://other.invalid/Team/Widget.git",
					},
					{ send },
				),
			).rejects.toMatchObject({ reason: "host" });
			await expect(
				checkouts.resolveGitlabClone(
					{
						organizationId: row.organizationId,
						cloneUrl: "https://gitlab.com/Other/Widget.git",
					},
					{ send },
				),
			).rejects.toMatchObject({ reason: "project" });
			expect(calls).toBe(0);
			expect(
				await checkouts.resolveGitlabClone(
					{
						organizationId: row.organizationId,
						cloneUrl: "git@gitlab.com:Team/Widget.git",
					},
					{ send },
				),
			).toMatchObject({
				connectionId: row.id,
				projectId: "37",
				pathWithNamespace: "Team/Widget",
				cloneUrl: "https://gitlab.com/Team/Widget.git",
				host: "gitlab.com",
			});
			expect(calls).toBe(2);
		});
		function latch() {
			let release!: () => void;
			const promise = new Promise<void>((resolve) => {
				release = resolve;
			});
			return { promise, release };
		}
		async function blockedWriter() {
			for (let attempt = 0; attempt < 50; attempt++) {
				const rows =
					await fixture.client`SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%authorized_connection%'`;
				if (rows.length) return;
				await new Promise((resolve) => setTimeout(resolve, 20));
			}
			throw new Error("Expected actual PostgreSQL writer lock wait");
		}
		for (const parent of ["workspace", "environment"] as const) {
			test(`${parent} tenant transfer during a blocked write cannot commit a foreign binding`, async () => {
				const { row, project } = await account();
				const foreign = await fixture.identity();
				const id =
					parent === "workspace"
						? await workspace(row.organizationId, row.connectedByUserId)
						: await environment(row.organizationId);
				const acquired = latch(),
					release = latch();
				const holder = fixture.client.begin(async (tx) => {
					await tx`SELECT id FROM connections WHERE id=${row.id} FOR UPDATE`;
					acquired.release();
					await release.promise;
				});
				await acquired.promise;
				const writing = (
					parent === "workspace"
						? checkouts.recordGitlabCheckout({
								cloudWorkspaceId: id,
								organizationId: row.organizationId,
								project,
							})
						: environments.setGitlabEnvironmentProject(fixture.db, {
								environmentId: id,
								organizationId: row.organizationId,
								project,
							})
				).then(
					() => ({ accepted: true, error: undefined }),
					(error) => ({ accepted: false, error }),
				);
				try {
					await blockedWriter();
					if (parent === "workspace")
						await fixture.client`UPDATE cloud_workspaces SET organization_id=${foreign.organizationId} WHERE id=${id}`;
					else
						await fixture.client`UPDATE environments SET organization_id=${foreign.organizationId} WHERE id=${id}`;
				} finally {
					release.release();
				}
				await holder;
				const result = await writing;
				expect(result.accepted).toBe(false);
				expect(String(result.error)).toContain("unavailable");
				const rows =
					parent === "workspace"
						? await fixture.client`SELECT cloud_workspace_id FROM gitlab_workspace_checkouts WHERE cloud_workspace_id=${id}`
						: await fixture.client`SELECT environment_id FROM gitlab_environment_projects WHERE environment_id=${id}`;
				expect(rows).toHaveLength(0);
			});
		}
	},
);
