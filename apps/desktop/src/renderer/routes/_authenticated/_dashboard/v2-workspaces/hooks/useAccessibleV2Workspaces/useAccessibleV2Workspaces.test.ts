import { describe, expect, test } from "bun:test";
import {
	and,
	createCollection,
	eq,
	localOnlyCollectionOptions,
	queryOnce,
} from "@tanstack/db";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "00000000-0000-0000-0000-000000000002";
const PROJECT_ID = "00000000-0000-0000-0000-000000000003";
const WORKSPACE_ID = "00000000-0000-0000-0000-000000000004";
const HOST_MACHINE_ID = "host-machine-1";

interface Workspace {
	id: string;
	organizationId: string;
	projectId: string;
	hostId: string;
	name: string;
}

interface Host {
	organizationId: string;
	machineId: string;
	name: string;
}

interface UsersHosts {
	organizationId: string;
	userId: string;
	hostId: string;
}

interface Project {
	id: string;
	organizationId: string;
	name: string;
}

function makeCollections(opts: { projects: Project[] }) {
	const v2Workspaces = createCollection(
		localOnlyCollectionOptions<Workspace>({
			getKey: (item) => item.id,
			initialData: [
				{
					id: WORKSPACE_ID,
					organizationId: ORG_ID,
					projectId: PROJECT_ID,
					hostId: HOST_MACHINE_ID,
					name: "feature-branch",
				},
			],
		}),
	);

	const v2Hosts = createCollection(
		localOnlyCollectionOptions<Host>({
			getKey: (item) => item.machineId,
			initialData: [
				{
					organizationId: ORG_ID,
					machineId: HOST_MACHINE_ID,
					name: "my-laptop",
				},
			],
		}),
	);

	const v2UsersHosts = createCollection(
		localOnlyCollectionOptions<UsersHosts>({
			getKey: (item) => `${item.userId}:${item.hostId}`,
			initialData: [
				{
					organizationId: ORG_ID,
					userId: USER_ID,
					hostId: HOST_MACHINE_ID,
				},
			],
		}),
	);

	const v2Projects = createCollection(
		localOnlyCollectionOptions<Project>({
			getKey: (item) => item.id,
			initialData: opts.projects,
		}),
	);

	return { v2Workspaces, v2Hosts, v2UsersHosts, v2Projects };
}

describe("useAccessibleV2Workspaces join semantics", () => {
	test("workspace is visible when v2Projects has the matching project row", async () => {
		const { v2Workspaces, v2Hosts, v2UsersHosts, v2Projects } = makeCollections(
			{
				projects: [
					{ id: PROJECT_ID, organizationId: ORG_ID, name: "my-project" },
				],
			},
		);

		const rows = await queryOnce((q) =>
			q
				.from({ workspaces: v2Workspaces })
				.innerJoin({ hosts: v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.innerJoin({ userHosts: v2UsersHosts }, ({ hosts, userHosts }) =>
					eq(userHosts.hostId, hosts.machineId),
				)
				.leftJoin({ projects: v2Projects }, ({ workspaces, projects }) =>
					eq(workspaces.projectId, projects.id),
				)
				.where(({ workspaces, userHosts }) =>
					and(
						eq(workspaces.organizationId, ORG_ID),
						eq(userHosts.userId, USER_ID),
					),
				)
				.select(({ workspaces, projects }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
					projectName: projects?.name ?? null,
				})),
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(WORKSPACE_ID);
		expect(rows[0]?.projectName).toBe("my-project");
	});

	test("reproduces bug: workspace disappears with innerJoin when v2Projects shape is empty", async () => {
		const { v2Workspaces, v2Hosts, v2UsersHosts, v2Projects } = makeCollections(
			{ projects: [] },
		);

		const rows = await queryOnce((q) =>
			q
				.from({ workspaces: v2Workspaces })
				.innerJoin({ hosts: v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.innerJoin({ userHosts: v2UsersHosts }, ({ hosts, userHosts }) =>
					eq(userHosts.hostId, hosts.machineId),
				)
				.innerJoin({ projects: v2Projects }, ({ workspaces, projects }) =>
					eq(workspaces.projectId, projects.id),
				)
				.where(({ workspaces, userHosts }) =>
					and(
						eq(workspaces.organizationId, ORG_ID),
						eq(userHosts.userId, USER_ID),
					),
				)
				.select(({ workspaces }) => ({ id: workspaces.id })),
		);

		expect(rows).toHaveLength(0);
	});

	test("fix: workspace remains visible with leftJoin when v2Projects shape is empty", async () => {
		const { v2Workspaces, v2Hosts, v2UsersHosts, v2Projects } = makeCollections(
			{ projects: [] },
		);

		const rows = await queryOnce((q) =>
			q
				.from({ workspaces: v2Workspaces })
				.innerJoin({ hosts: v2Hosts }, ({ workspaces, hosts }) =>
					eq(workspaces.hostId, hosts.machineId),
				)
				.innerJoin({ userHosts: v2UsersHosts }, ({ hosts, userHosts }) =>
					eq(userHosts.hostId, hosts.machineId),
				)
				.leftJoin({ projects: v2Projects }, ({ workspaces, projects }) =>
					eq(workspaces.projectId, projects.id),
				)
				.where(({ workspaces, userHosts }) =>
					and(
						eq(workspaces.organizationId, ORG_ID),
						eq(userHosts.userId, USER_ID),
					),
				)
				.select(({ workspaces, projects }) => ({
					id: workspaces.id,
					projectId: workspaces.projectId,
					projectName: projects?.name ?? null,
				})),
		);

		expect(rows).toHaveLength(1);
		expect(rows[0]?.id).toBe(WORKSPACE_ID);
		expect(rows[0]?.projectId).toBe(PROJECT_ID);
		expect(rows[0]?.projectName ?? null).toBeNull();
	});
});
