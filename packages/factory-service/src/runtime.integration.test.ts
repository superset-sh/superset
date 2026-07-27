import { afterEach, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { type SupersetFactoryRuntime, startSupersetFactory } from "./index";

const temporaryDirectories: string[] = [];
const runtimes: SupersetFactoryRuntime[] = [];

afterEach(async () => {
	await Promise.allSettled(
		runtimes.splice(0).map((runtime) => runtime.shutdown()),
	);
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

describe("startSupersetFactory", () => {
	test("mounts an authenticated governed work-item lifecycle", async () => {
		const stateDirectory = await mkdtemp(
			join(tmpdir(), "superset-factory-test-"),
		);
		temporaryDirectories.push(stateDirectory);

		const app = new Hono();
		const runtime = await startSupersetFactory({
			app,
			organizationId: "org-test",
			hostDbPath: join(stateDirectory, "host.db"),
			allowedOrigins: ["http://localhost:45785"],
			authorize: (request) =>
				request.headers.get("x-superset-host-token") === "test-token",
		});
		runtimes.push(runtime);

		const unauthorized = await app.request("/factory/web/factory/projects");
		expect(unauthorized.status).toBe(401);

		const headers = {
			Authorization: "Bearer test-token",
			"Content-Type": "application/json",
			"x-superset-host-token": "test-token",
		};
		const createProjectResponse = await app.request(
			"/factory/web/factory/projects",
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					name: "Superset Factory",
					description: "Integration test Factory",
				}),
			},
		);
		expect(createProjectResponse.status).toBe(201);
		const createProjectBody = (await createProjectResponse.json()) as {
			project: { id: string; name: string };
		};
		expect(createProjectBody.project.name).toBe("Superset Factory");

		const createWorkItemResponse = await app.request(
			`/factory/web/factory/projects/${createProjectBody.project.id}/work-items`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					title: "Verify the mounted Factory",
					stages: ["intake"],
					metadata: {
						board: "work",
						decision: "Investigate request",
					},
				}),
			},
		);
		expect(createWorkItemResponse.status).toBe(200);
		const createWorkItemBody = (await createWorkItemResponse.json()) as {
			workItem: {
				id: string;
				revision: number;
				stageHistory: Array<{ stage: string }>;
				stages: string[];
				title: string;
			};
		};
		expect(createWorkItemBody.workItem).toMatchObject({
			title: "Verify the mounted Factory",
			stages: ["intake"],
		});

		let revision = createWorkItemBody.workItem.revision;
		for (const stage of ["triage", "planning", "execute", "review", "done"]) {
			const transitionResponse = await app.request(
				`/factory/web/factory/projects/${createProjectBody.project.id}/work-items/${createWorkItemBody.workItem.id}/transition`,
				{
					method: "POST",
					headers,
					body: JSON.stringify({
						board: "work",
						stage,
						expectedRevision: revision,
						requestId: randomUUID(),
						cause: "superset-factory-integration-test",
					}),
				},
			);
			expect(transitionResponse.status).toBe(200);
			const transitionBody = (await transitionResponse.json()) as {
				result: { revision: number; stage: string; status: string };
			};
			expect(transitionBody.result).toMatchObject({
				stage,
				status: "accepted",
			});
			revision = transitionBody.result.revision;
		}

		const listWorkItemsResponse = await app.request(
			`/factory/web/factory/projects/${createProjectBody.project.id}/work-items`,
			{ headers },
		);
		expect(listWorkItemsResponse.status).toBe(200);
		const listWorkItemsBody = (await listWorkItemsResponse.json()) as {
			workItems: Array<{
				id: string;
				revision: number;
				stageHistory: Array<{ stage: string }>;
				stages: string[];
			}>;
		};
		expect(listWorkItemsBody.workItems).toHaveLength(1);
		expect(listWorkItemsBody.workItems[0]).toMatchObject({
			id: createWorkItemBody.workItem.id,
			revision,
			stages: ["done"],
		});
		expect(
			listWorkItemsBody.workItems[0]?.stageHistory.map(({ stage }) => stage),
		).toEqual(["intake", "triage", "planning", "execute", "review", "done"]);

		const staleTransitionResponse = await app.request(
			`/factory/web/factory/projects/${createProjectBody.project.id}/work-items/${createWorkItemBody.workItem.id}/transition`,
			{
				method: "POST",
				headers,
				body: JSON.stringify({
					board: "work",
					stage: "canceled",
					expectedRevision: createWorkItemBody.workItem.revision,
					requestId: randomUUID(),
					cause: "superset-factory-integration-test",
				}),
			},
		);
		expect(staleTransitionResponse.status).toBe(409);
		expect(await staleTransitionResponse.json()).toMatchObject({
			result: {
				code: "stale",
				status: "rejected",
			},
		});
	});
});
