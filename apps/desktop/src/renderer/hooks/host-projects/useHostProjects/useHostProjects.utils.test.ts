import { describe, expect, test } from "bun:test";
import { QueryClient } from "@tanstack/react-query";
import {
	applyProjectChangedEvent,
	getHostProjectsQueryKey,
	isHostProjectsListLive,
	markHostProjectsListRead,
	normalizeHostProjectRow,
} from "./useHostProjects.utils";

const tagSettings = [
	{
		tag: "api",
		displayName: "API",
		color: "#ff0000",
		tabOrder: null,
	},
];

describe("old-host tag settings compatibility", () => {
	test("normalization preserves project.list tag settings", () => {
		expect(
			normalizeHostProjectRow({
				id: "project",
				repoPath: "/tmp/project",
				tagSettings,
			}).tagSettings,
		).toEqual(tagSettings);
	});

	test("project events keep the last settings when a snapshot omits them", () => {
		const existing = normalizeHostProjectRow({
			id: "project",
			repoPath: "/tmp/project",
			tagSettings,
		});
		const next = applyProjectChangedEvent(
			[existing],
			{
				eventType: "updated",
				project: {
					id: "project",
					name: "Renamed",
					repoPath: "/tmp/project",
					repoOwner: null,
					repoName: null,
					repoUrl: null,
					worktreeBaseDir: null,
					icon: null,
					color: null,
					createdAt: 1,
					updatedAt: 2,
				},
			},
			"project",
		);
		expect(next?.[0]?.tagSettings).toEqual(tagSettings);
	});
});

describe("isHostProjectsListLive", () => {
	const target = {
		organizationId: "org-1",
		machineId: "machine-1",
		hostUrl: "http://127.0.0.1:4100",
	};
	const snapshot = {
		id: "project",
		name: "project",
		repoPath: "/tmp/project",
		repoOwner: null,
		repoName: null,
		repoUrl: null,
		worktreeBaseDir: null,
		icon: null,
		color: null,
		createdAt: 1,
		updatedAt: 1,
	};

	test("is not live when an event created the list before the first list answer", async () => {
		const queryClient = new QueryClient();
		const key = getHostProjectsQueryKey(target);
		queryClient.setQueryData(
			key,
			applyProjectChangedEvent(
				undefined,
				{ eventType: "created", project: snapshot },
				"project",
			),
		);
		expect(queryClient.getQueryState(key)?.status).toBe("success");
		expect(isHostProjectsListLive(queryClient, target)).toBe(false);

		await queryClient.fetchQuery({
			queryKey: key,
			queryFn: async () => {
				markHostProjectsListRead(queryClient, target);
				return [];
			},
		});
		expect(isHostProjectsListLive(queryClient, target)).toBe(true);
	});

	test("is not live after a failed refetch or without a reachable URL", async () => {
		const queryClient = new QueryClient();
		const key = getHostProjectsQueryKey(target);
		await queryClient.fetchQuery({
			queryKey: key,
			queryFn: async () => {
				markHostProjectsListRead(queryClient, target);
				return [];
			},
		});
		expect(
			isHostProjectsListLive(queryClient, { ...target, hostUrl: null }),
		).toBe(false);
		await queryClient
			.fetchQuery({
				queryKey: key,
				staleTime: 0,
				retry: false,
				queryFn: async () => {
					throw new Error("offline");
				},
			})
			.catch(() => {});
		expect(isHostProjectsListLive(queryClient, target)).toBe(false);
	});
});
