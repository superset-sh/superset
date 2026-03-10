/**
 * Task Mutation Hooks
 *
 * 태스크, 프로젝트, 사이클, 라벨, 댓글 생성/수정/삭제 뮤테이션 훅
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";
import { toast } from "sonner";

// ============================================================================
// Task
// ============================================================================

export function useCreateTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trpc.task.create.mutationOptions().mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({
        queryKey: trpc.task.list.queryKey(),
      });

      const previousData = queryClient.getQueriesData({
        queryKey: trpc.task.list.queryKey(),
      });

      // Optimistic insert: add a temporary task so the UI updates instantly
      const tempTask = {
        id: `temp-${Date.now()}`,
        identifier: "...",
        title: variables.title,
        description: variables.description ?? null,
        status: variables.status ?? "backlog",
        priority: variables.priority ?? 0,
        sortOrder: 0,
        projectId: variables.projectId ?? null,
        cycleId: null,
        estimate: variables.estimate ?? null,
        dueDate: null,
        assigneeId: null,
        parentId: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        labels: [],
        assignee: null,
        project: null,
      };

      for (const [queryKey, data] of previousData) {
        if (!data || typeof data !== "object") continue;
        const result = data as {
          tasks?: Array<{ id: string; [k: string]: unknown }>;
        };
        if (!Array.isArray(result.tasks)) continue;

        queryClient.setQueryData(queryKey, {
          ...result,
          tasks: [tempTask, ...result.tasks],
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to create task.");
    },
    onSettled: () => {
      // Replace optimistic temp task with real server data
      queryClient.invalidateQueries({
        queryKey: trpc.task.list.queryKey(),
      });
    },
  });
}

export function useUpdateTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.update.mutationOptions(),
    onMutate: async (variables) => {
      // Cancel outgoing refetches to avoid overwriting optimistic data
      await queryClient.cancelQueries({
        queryKey: trpc.task.list.queryKey(),
      });

      // 1. Snapshot + optimistic update: list caches (board/list views)
      const previousListData = queryClient.getQueriesData({
        queryKey: trpc.task.list.queryKey(),
      });
      for (const [queryKey, data] of previousListData) {
        if (!data || typeof data !== "object") continue;
        const result = data as {
          tasks?: Array<{ id: string; [k: string]: unknown }>;
        };
        if (!Array.isArray(result.tasks)) continue;

        queryClient.setQueryData(queryKey, {
          ...result,
          tasks: result.tasks.map((task) =>
            task.id === variables.id
              ? { ...task, ...variables.data }
              : task,
          ),
        });
      }

      // 2. Snapshot + optimistic update: detail cache (sidebar property changes)
      const previousDetailEntries: Array<{
        queryKey: readonly unknown[];
        data: unknown;
      }> = [];
      for (const query of queryClient.getQueryCache().findAll()) {
        const qData = query.state.data;
        if (
          qData &&
          typeof qData === "object" &&
          "id" in qData &&
          "identifier" in qData &&
          (qData as { id: string }).id === variables.id
        ) {
          previousDetailEntries.push({
            queryKey: query.queryKey,
            data: qData,
          });
          queryClient.setQueryData(query.queryKey, {
            ...(qData as object),
            ...variables.data,
          });
        }
      }

      return { previousListData, previousDetailEntries };
    },
    onError: (_err, _variables, context) => {
      // Rollback on error
      if (context?.previousListData) {
        for (const [queryKey, data] of context.previousListData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      if (context?.previousDetailEntries) {
        for (const { queryKey, data } of context.previousDetailEntries) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to update task. Changes reverted.");
    },
    onSuccess: (data, variables) => {
      // Detail cache: mark stale without immediate refetch to avoid overriding
      // optimistic data. Syncs on next window focus or navigation.
      if (data?.identifier) {
        queryClient.invalidateQueries({
          queryKey: trpc.task.byIdentifier.queryKey({
            identifier: data.identifier,
          }),
          refetchType: "none",
        });
      }
      // Activity feed: refetch immediately (no optimistic data to protect)
      queryClient.invalidateQueries({
        queryKey: trpc.task.activityList.queryKey({ taskId: variables.id }),
      });
    },
    onSettled: () => {
      // Mark stale without immediate refetch to prevent visual "jump back"
      // after optimistic update. Data syncs on next window focus or navigation.
      queryClient.invalidateQueries({
        queryKey: trpc.task.list.queryKey(),
        refetchType: "none",
      });
    },
  });
}

export function useDeleteTask() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trpc.task.delete.mutationOptions().mutationFn,
    onMutate: async (variables: { id: string }) => {
      await queryClient.cancelQueries({
        queryKey: trpc.task.list.queryKey(),
      });

      // Snapshot + optimistic removal from all list caches
      const previousData = queryClient.getQueriesData({
        queryKey: trpc.task.list.queryKey(),
      });
      for (const [queryKey, data] of previousData) {
        if (!data || typeof data !== "object") continue;
        const result = data as {
          tasks?: Array<{ id: string; [k: string]: unknown }>;
        };
        if (!Array.isArray(result.tasks)) continue;

        queryClient.setQueryData(queryKey, {
          ...result,
          tasks: result.tasks.filter((task) => task.id !== variables.id),
        });
      }

      return { previousData };
    },
    onError: (_err, _variables, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to delete task. Changes reverted.");
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.list.queryKey(),
        refetchType: "none",
      });
    },
  });
}

export function useBulkUpdateOrder() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: trpc.task.bulkUpdateOrder.mutationOptions().mutationFn,
    onMutate: async (input) => {
      await queryClient.cancelQueries({
        queryKey: trpc.task.list.queryKey(),
      });
      const previousData = queryClient.getQueriesData({
        queryKey: trpc.task.list.queryKey(),
      });

      // Optimistic cache update — apply changes immediately
      for (const [queryKey, data] of previousData) {
        if (!data || typeof data !== "object") continue;
        const result = data as { tasks?: Array<{ id: string; sortOrder: number; status: string; [k: string]: unknown }> };
        if (!Array.isArray(result.tasks)) continue;

        const updatedTasks = result.tasks.map((task) => {
          const update = input.updates.find((u) => u.id === task.id);
          if (!update) return task;
          return {
            ...task,
            sortOrder: update.sortOrder,
            ...(update.status !== undefined ? { status: update.status } : {}),
          };
        });
        queryClient.setQueryData(queryKey, { ...result, tasks: updatedTasks });
      }

      return { previousData };
    },
    onError: (_err, _input, context) => {
      if (context?.previousData) {
        for (const [queryKey, data] of context.previousData) {
          queryClient.setQueryData(queryKey, data);
        }
      }
      toast.error("Failed to move task. Changes reverted.");
    },
    onSettled: () => {
      // Mark stale without immediate refetch to prevent visual "jump back"
      // after optimistic update. Data syncs on next window focus or navigation.
      queryClient.invalidateQueries({
        queryKey: trpc.task.list.queryKey(),
        refetchType: "none",
      });
    },
  });
}

// ============================================================================
// Project
// ============================================================================

export function useCreateProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.projectCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.projectList.queryKey(),
      });
    },
  });
}

export function useUpdateProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.projectUpdate.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.projectList.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.task.projectById.queryKey({ id: variables.id }),
      });
    },
  });
}

export function useDeleteProject() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.projectDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.projectList.queryKey(),
      });
    },
  });
}

// ============================================================================
// Cycle
// ============================================================================

export function useCreateCycle() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.cycleCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.cycleList.queryKey(),
      });
    },
  });
}

export function useUpdateCycle() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.cycleUpdate.mutationOptions(),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.cycleList.queryKey(),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.task.cycleById.queryKey({ id: variables.id }),
      });
    },
  });
}

// ============================================================================
// Label
// ============================================================================

export function useCreateLabel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.labelCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.labelList.queryKey(),
      });
    },
  });
}

export function useDeleteLabel() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.labelDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.labelList.queryKey(),
      });
    },
  });
}

// ============================================================================
// Comment
// ============================================================================

export function useCreateComment(taskId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.commentCreate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.commentList.queryKey({ taskId }),
      });
      queryClient.invalidateQueries({
        queryKey: trpc.task.activityList.queryKey({ taskId }),
      });
    },
  });
}

export function useUpdateComment(taskId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.commentUpdate.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.commentList.queryKey({ taskId }),
      });
    },
  });
}

export function useDeleteComment(taskId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.task.commentDelete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: trpc.task.commentList.queryKey({ taskId }),
      });
    },
  });
}
