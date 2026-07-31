import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useLocalHostService } from "renderer/routes/_authenticated/providers/LocalHostServiceProvider";
import {
	DEMO_FACTORY_PROJECTS,
	DEMO_FACTORY_WORK_ITEMS,
} from "../../data/demo-factory";
import {
	createFactoryProject,
	createManualFactoryWorkItem,
	listFactoryProjects,
	listFactoryWorkItems,
	transitionFactoryWorkItem,
} from "../../data/factory-api";
import type {
	FactoryBoardKind,
	FactoryProject,
	FactoryStage,
	FactoryWorkItem,
} from "../../types";
import { applyDemoTransition } from "../../utils/factory-utils";

const projectsQueryKey = (hostUrl: string | null) =>
	["factory", "projects", hostUrl] as const;
const workItemsQueryKey = (
	hostUrl: string | null,
	factoryProjectId: string | null,
) => ["factory", "work-items", hostUrl, factoryProjectId] as const;

interface UseFactoryDataOptions {
	demo: boolean;
}

export function useFactoryData({ demo }: UseFactoryDataOptions) {
	const { activeHostUrl } = useLocalHostService();
	const queryClient = useQueryClient();
	const [demoItems, setDemoItems] = useState(DEMO_FACTORY_WORK_ITEMS);
	const [activeProjectId, setActiveProjectId] = useState<string | null>(
		demo ? (DEMO_FACTORY_PROJECTS[0]?.id ?? null) : null,
	);

	const projectsQuery = useQuery({
		queryKey: projectsQueryKey(activeHostUrl),
		enabled: !demo && activeHostUrl !== null,
		queryFn: async () => {
			if (!activeHostUrl) return [];
			return listFactoryProjects(activeHostUrl);
		},
	});

	const projects = useMemo<FactoryProject[]>(
		() => (demo ? DEMO_FACTORY_PROJECTS : (projectsQuery.data ?? [])),
		[demo, projectsQuery.data],
	);

	useEffect(() => {
		if (projects.length === 0) {
			setActiveProjectId(null);
			return;
		}
		if (!projects.some((project) => project.id === activeProjectId)) {
			setActiveProjectId(projects[0]?.id ?? null);
		}
	}, [activeProjectId, projects]);

	const workItemsQuery = useQuery({
		queryKey: workItemsQueryKey(activeHostUrl, activeProjectId),
		enabled: !demo && activeHostUrl !== null && activeProjectId !== null,
		queryFn: async () => {
			if (!activeHostUrl || !activeProjectId) return [];
			return listFactoryWorkItems(activeHostUrl, activeProjectId);
		},
		refetchInterval: 5_000,
	});

	const createProjectMutation = useMutation({
		mutationFn: async () => {
			if (!activeHostUrl)
				throw new Error("The local host service is not ready.");
			return createFactoryProject(activeHostUrl, "Superset Factory");
		},
		onSuccess: async (project) => {
			setActiveProjectId(project.id);
			await queryClient.invalidateQueries({
				queryKey: projectsQueryKey(activeHostUrl),
			});
		},
	});

	const createWorkItemMutation = useMutation({
		mutationFn: async (title: string) => {
			if (demo) {
				const now = new Date().toISOString();
				const item: FactoryWorkItem = {
					id: `manual-${crypto.randomUUID()}`,
					factoryProjectId: activeProjectId ?? "superset",
					source: "manual",
					sourceKey: null,
					title,
					url: null,
					stages: ["intake"],
					stageHistory: [{ stage: "intake", enteredAt: now, by: "Roshvan" }],
					metadata: {
						board: "work",
						age: "now",
						decision: "Investigate request",
						project: "superset / superset",
					},
					revision: 1,
					createdAt: now,
					updatedAt: now,
				};
				setDemoItems((items) => [item, ...items]);
				return item;
			}
			if (!activeHostUrl || !activeProjectId) {
				throw new Error("Create a Factory before adding work.");
			}
			return createManualFactoryWorkItem(activeHostUrl, activeProjectId, title);
		},
		onSuccess: async () => {
			if (!demo) {
				await queryClient.invalidateQueries({
					queryKey: workItemsQueryKey(activeHostUrl, activeProjectId),
				});
			}
		},
	});

	const transitionMutation = useMutation({
		mutationFn: async ({
			item,
			board,
			stage,
		}: {
			item: FactoryWorkItem;
			board: FactoryBoardKind;
			stage: FactoryStage;
		}) => {
			if (demo) {
				const transitioned = applyDemoTransition(item, stage);
				setDemoItems((items) =>
					items.map((candidate) =>
						candidate.id === item.id ? transitioned : candidate,
					),
				);
				return transitioned;
			}
			if (!activeHostUrl || !activeProjectId) {
				throw new Error("The Factory service is not ready.");
			}
			await transitionFactoryWorkItem(
				activeHostUrl,
				activeProjectId,
				item,
				board,
				stage,
			);
			return { ...item, stages: [...item.stages, stage] };
		},
		onSuccess: async () => {
			if (!demo) {
				await queryClient.invalidateQueries({
					queryKey: workItemsQueryKey(activeHostUrl, activeProjectId),
				});
			}
		},
	});

	return {
		activeHostUrl,
		activeProjectId,
		createProject: createProjectMutation.mutateAsync,
		createProjectError: createProjectMutation.error,
		createProjectPending: createProjectMutation.isPending,
		createWorkItem: createWorkItemMutation.mutateAsync,
		createWorkItemPending: createWorkItemMutation.isPending,
		error: demo ? null : (projectsQuery.error ?? workItemsQuery.error),
		isLoading:
			!demo &&
			(projectsQuery.isLoading ||
				(activeProjectId !== null && workItemsQuery.isLoading)),
		projects,
		refresh: async () => {
			if (demo) {
				setDemoItems(DEMO_FACTORY_WORK_ITEMS);
				setActiveProjectId(DEMO_FACTORY_PROJECTS[0]?.id ?? null);
				return;
			}
			await Promise.all([
				projectsQuery.refetch(),
				activeProjectId ? workItemsQuery.refetch() : Promise.resolve(),
			]);
		},
		setActiveProjectId,
		transition: transitionMutation.mutateAsync,
		transitionPending: transitionMutation.isPending,
		workItems: demo ? demoItems : (workItemsQuery.data ?? []),
	};
}
