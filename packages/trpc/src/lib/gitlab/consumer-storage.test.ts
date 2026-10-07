import { afterAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import {
	cloudWorkspaces,
	environments as environmentTable,
} from "@superset/db/schema";
import { sql } from "drizzle-orm";
import {
	connectionFixture,
	fixtureUrl,
} from "./connection.fixture.integration";

describe.skipIf(!fixtureUrl)(
	"owned PostgreSQL GitLab consumer parent locks",
	() => {
		let fixture: Awaited<ReturnType<typeof connectionFixture>>;
		let consumers: typeof import("./consumer-storage");
		let checkout: typeof import("./checkout");
		let environments: typeof import("./environment-project");
		const ready = fixtureUrl
			? connectionFixture().then(async (value) => {
					fixture = value;
					consumers = await import("./consumer-storage");
					checkout = await import("./checkout");
					environments = await import("./environment-project");
				})
			: Promise.resolve();
		afterAll(async () => {
			await ready;
			await fixture?.close();
		});
		function latch() {
			let release = () => {};
			const promise = new Promise<void>((resolve) => {
				release = resolve;
			});
			return { promise, release };
		}
		async function blocked(query: string) {
			for (let i = 0; i < 100; i++) {
				const waiting =
					await fixture.client`SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE ${`%${query}%`}`;
				if (waiting.length) return;
				await Bun.sleep(10);
			}
			throw new Error("Actual PostgreSQL lock wait was not observed");
		}
		async function seed() {
			await ready;
			const connection = await fixture.seed({
				state: {
					provider: "gitlab",
					host: "gitlab.com",
					groupPath: "Team",
					scopeKind: "group",
					auth: "token",
					webhookSecret: "FIXTURE_ONLY_HOOK",
				},
			});
			const environment = {
				id: randomUUID(),
				organizationId: connection.organizationId,
				scope: "organization" as const,
				createdByUserId: connection.connectedByUserId,
				sourceKind: "image" as const,
				sourceRef: "fixture:image",
			};
			await fixture.db.insert(environmentTable).values({
				...environment,
				name: "Fixture environment",
			});
			const project = {
				connectionId: connection.id,
				projectId: "37",
				pathWithNamespace: "Team/Widget",
				cloneUrl: "https://gitlab.com/Team/Widget.git",
				defaultBranch: "main",
			};
			return { connection, environment, project };
		}
		for (const mutation of [
			"archive",
			"organization",
			"personal",
			"source",
		] as const) {
			test(`${mutation} change while waiting for the parent cannot create a workspace binding`, async () => {
				const { connection, environment, project } = await seed();
				const foreign = await fixture.identity();
				const acquired = latch(),
					release = latch();
				const holder = fixture.client.begin(async (tx) => {
					await tx`SELECT id FROM environments WHERE id=${environment.id} FOR UPDATE`;
					acquired.release();
					await release.promise;
					if (mutation === "archive")
						await tx`UPDATE environments SET archived_at=now() WHERE id=${environment.id}`;
					if (mutation === "organization")
						await tx`UPDATE environments SET organization_id=${foreign.organizationId} WHERE id=${environment.id}`;
					if (mutation === "personal")
						await tx`UPDATE environments SET scope='personal',created_by_user_id=${foreign.userId} WHERE id=${environment.id}`;
					if (mutation === "source")
						await tx`UPDATE environments SET source_kind='fork',source_ref='changed-golden' WHERE id=${environment.id}`;
				});
				await acquired.promise;
				const workspaceId = randomUUID();
				const writing = fixture.db
					.transaction(async (tx) => {
						await consumers.lockGitlabConsumerEnvironment(tx, {
							environment,
							organizationId: connection.organizationId,
							userId: connection.connectedByUserId,
						});
						await tx.insert(cloudWorkspaces).values({
							id: workspaceId,
							organizationId: connection.organizationId,
							createdByUserId: connection.connectedByUserId,
							visibility: "org",
							environmentId: environment.id,
							name: "Fixture workspace",
							branch: "fixture/branch",
							baseBranch: "main",
							providerSandboxId: `fixture-${workspaceId}`,
						});
						await checkout.recordGitlabCheckout({
							cloudWorkspaceId: workspaceId,
							organizationId: connection.organizationId,
							project,
							executor: tx,
						});
					})
					.then(
						() => ({ accepted: true, error: undefined }),
						(error) => ({ accepted: false, error }),
					);
				try {
					await blocked("SELECT id FROM environments");
				} finally {
					release.release();
				}
				await holder;
				const result = await writing;
				expect(result.accepted).toBe(false);
				expect(result.error).toMatchObject({ code: "NOT_FOUND" });
				expect(
					await fixture.client`SELECT id FROM cloud_workspaces WHERE id=${workspaceId}`,
				).toHaveLength(0);
				expect(
					await fixture.client`SELECT cloud_workspace_id FROM gitlab_workspace_checkouts WHERE cloud_workspace_id=${workspaceId}`,
				).toHaveLength(0);
			});
		}
		test("held current parent blocks an archive until workspace and scoped binding commit", async () => {
			const { connection, environment, project } = await seed();
			const acquired = latch(),
				release = latch();
			const workspaceId = randomUUID();
			const writing = fixture.db.transaction(async (tx) => {
				await consumers.lockGitlabConsumerEnvironment(tx, {
					environment,
					organizationId: connection.organizationId,
					userId: connection.connectedByUserId,
				});
				acquired.release();
				await release.promise;
				await tx.insert(cloudWorkspaces).values({
					id: workspaceId,
					organizationId: connection.organizationId,
					createdByUserId: connection.connectedByUserId,
					visibility: "org",
					environmentId: environment.id,
					name: "Fixture workspace",
					branch: "fixture/branch",
					baseBranch: "main",
					providerSandboxId: `fixture-${workspaceId}`,
				});
				await checkout.recordGitlabProject(
					connection.organizationId,
					project,
					tx,
				);
				await checkout.recordGitlabCheckout({
					cloudWorkspaceId: workspaceId,
					organizationId: connection.organizationId,
					project,
					executor: tx,
				});
			});
			await acquired.promise;
			let finished = false;
			const archiving =
				fixture.client`UPDATE environments SET archived_at=now() WHERE id=${environment.id}`.then(
					() => {
						finished = true;
					},
				);
			try {
				await blocked("UPDATE environments SET archived_at");
				expect(finished).toBe(false);
			} finally {
				release.release();
			}
			await writing;
			await archiving;
			expect(
				await checkout.loadGitlabCheckout(
					workspaceId,
					connection.organizationId,
				),
			).toEqual(project);
			expect(
				await fixture.client`SELECT id FROM cloud_workspaces WHERE id=${workspaceId}`,
			).toHaveLength(1);
		});
		test("stored binding repoint under the current parent aborts creation after fresh reread", async () => {
			const { connection, environment, project } = await seed();
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: environment.id,
				organizationId: connection.organizationId,
				project,
			});
			const captured = await environments.loadGitlabEnvironmentProject(
				environment.id,
				connection.organizationId,
			);
			await fixture.client`UPDATE gitlab_environment_projects SET project_id='38' WHERE environment_id=${environment.id}`;
			await expect(
				fixture.db.transaction(async (tx) => {
					await consumers.lockGitlabConsumerEnvironment(tx, {
						environment,
						organizationId: connection.organizationId,
						userId: connection.connectedByUserId,
					});
					consumers.requireSameGitlabConsumerBinding(
						captured,
						await environments.loadGitlabEnvironmentProject(
							environment.id,
							connection.organizationId,
							tx,
						),
					);
				}),
			).rejects.toMatchObject({ code: "CONFLICT" });
		});
		test("grant revocation rolls back the newly inserted workspace and project snapshot", async () => {
			const { connection, environment, project } = await seed();
			const workspaceId = randomUUID();
			await fixture.client`UPDATE connections SET disconnected_at=now() WHERE id=${connection.id}`;
			await expect(
				fixture.db.transaction(async (tx) => {
					await consumers.lockGitlabConsumerEnvironment(tx, {
						environment,
						organizationId: connection.organizationId,
						userId: connection.connectedByUserId,
					});
					await tx.insert(cloudWorkspaces).values({
						id: workspaceId,
						organizationId: connection.organizationId,
						createdByUserId: connection.connectedByUserId,
						visibility: "org",
						environmentId: environment.id,
						name: "Fixture workspace",
						branch: "fixture/branch",
						baseBranch: "main",
						providerSandboxId: `fixture-${workspaceId}`,
					});
					await checkout.recordGitlabProject(
						connection.organizationId,
						project,
						tx,
					);
					await checkout.recordGitlabCheckout({
						cloudWorkspaceId: workspaceId,
						organizationId: connection.organizationId,
						project,
						executor: tx,
					});
				}),
			).rejects.toThrow("unavailable");
			expect(
				await fixture.client`SELECT id FROM cloud_workspaces WHERE id=${workspaceId}`,
			).toHaveLength(0);
			expect(
				await fixture.client`SELECT id FROM gitlab_cloud_projects WHERE connection_id=${connection.id}`,
			).toHaveLength(0);
		});
		test("physical binding presence survives a foreign grant that the scoped loader hides", async () => {
			const { connection, environment, project } = await seed();
			await consumers.requireAbsentGitlabConsumerBinding(
				fixture.db,
				environment.id,
			);
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: environment.id,
				organizationId: connection.organizationId,
				project,
			});
			const foreign = await fixture.identity();
			await fixture.client`UPDATE connections SET organization_id=${foreign.organizationId} WHERE id=${connection.id}`;
			expect(
				await environments.loadGitlabEnvironmentProject(
					environment.id,
					connection.organizationId,
				),
			).toBeNull();
			await expect(
				consumers.requireAbsentGitlabConsumerBinding(
					fixture.db,
					environment.id,
				),
			).rejects.toMatchObject({
				code: "BAD_REQUEST",
				cause: { i18nKey: "serverError.cloudWorkspace.reconnectGitLab" },
			});
		});
		test("a tentative target update with its row lock rolls back when physical binding presence is hidden", async () => {
			const { connection, environment, project } = await seed();
			await consumers.requireAbsentGitlabConsumerBinding(
				fixture.db,
				environment.id,
			);
			await environments.setGitlabEnvironmentProject(fixture.db, {
				environmentId: environment.id,
				organizationId: connection.organizationId,
				project,
			});
			const foreign = await fixture.identity();
			await fixture.client`UPDATE connections SET organization_id=${foreign.organizationId} WHERE id=${connection.id}`;
			expect(
				await environments.loadGitlabEnvironmentProject(
					environment.id,
					connection.organizationId,
				),
			).toBeNull();
			await expect(
				fixture.db.transaction(async (tx) => {
					await tx.execute(
						sql`UPDATE environments SET source_kind='fork',source_ref='fixture:new-golden' WHERE id=${environment.id}::uuid AND source_ref=${environment.sourceRef} RETURNING id`,
					);
					await consumers.requireAbsentGitlabConsumerBinding(
						tx,
						environment.id,
					);
				}),
			).rejects.toMatchObject({ code: "BAD_REQUEST" });
			const [saved] =
				await fixture.client`SELECT source_kind,source_ref FROM environments WHERE id=${environment.id}`;
			expect(saved).toMatchObject({
				source_kind: "image",
				source_ref: "fixture:image",
			});
			expect(
				await fixture.client`SELECT environment_id FROM gitlab_environment_projects WHERE environment_id=${environment.id}`,
			).toHaveLength(1);
		});
		test("promotion lock rejects a current private workspace owned by another caller", async () => {
			const { connection, environment } = await seed();
			const foreign = await fixture.identity();
			const workspace = {
				id: randomUUID(),
				organizationId: connection.organizationId,
				environmentId: environment.id,
				baseBranch: "main",
				branch: "superset/fixture",
				providerSandboxId: `fixture-${randomUUID()}`,
			};
			await fixture.db.insert(cloudWorkspaces).values({
				...workspace,
				name: "Fixture workspace",
				createdByUserId: foreign.userId,
				visibility: "just_me",
				status: "ready",
			});
			await expect(
				consumers.lockGitlabConsumerWorkspace(fixture.db, {
					workspace,
					userId: connection.connectedByUserId,
				}),
			).rejects.toMatchObject({ code: "NOT_FOUND" });
		});
	},
);
