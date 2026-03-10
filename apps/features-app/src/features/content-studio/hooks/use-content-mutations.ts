import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useStudioMutations() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const createStudio = useMutation(
    trpc.contentStudio.createStudio.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.contentStudio.studios.queryKey() });
      },
    })
  );

  const updateStudio = useMutation(
    trpc.contentStudio.updateStudio.mutationOptions()
  );

  const deleteStudio = useMutation(
    trpc.contentStudio.deleteStudio.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.contentStudio.studios.queryKey() });
      },
    })
  );

  return { createStudio, updateStudio, deleteStudio };
}

export function useCanvasMutations(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const canvasKey = trpc.contentStudio.canvas.queryKey({ studioId });

  const invalidateCanvas = () => queryClient.invalidateQueries({ queryKey: canvasKey });

  // Optimistic ID generator
  const getTempId = () => `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const createTopic = useMutation(
    trpc.contentStudio.createTopic.mutationOptions({
      onMutate: async (newTopic) => {
        await queryClient.cancelQueries({ queryKey: canvasKey });
        const previousData = queryClient.getQueryData<any>(canvasKey);
        
        if (previousData) {
          queryClient.setQueryData(canvasKey, {
            ...previousData,
            topics: [
              ...previousData.topics,
              {
                id: getTempId(), // 임시 ID
                label: newTopic.label,
                color: newTopic.color || "#e2e8f0",
                positionX: newTopic.positionX || 0,
                positionY: newTopic.positionY || 0,
                studioId: newTopic.studioId,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        }
        return { previousData };
      },
      onError: (_err, _newTopic, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(canvasKey, context.previousData);
        }
      },
      onSuccess: () => {
        // We defer invalidation slightly so if createEdge is called immediately after, 
        // it has time to inject its own optimistic update before the network request overrides it.
        setTimeout(invalidateCanvas, 100);
      },
    })
  );

  const updateTopic = useMutation(
    trpc.contentStudio.updateTopic.mutationOptions({ onSuccess: invalidateCanvas })
  );

  const deleteTopic = useMutation(
    trpc.contentStudio.deleteTopic.mutationOptions({ onSuccess: invalidateCanvas })
  );

  const createContent = useMutation(
    trpc.contentStudio.createContent.mutationOptions({
      onMutate: async (newContent) => {
        await queryClient.cancelQueries({ queryKey: canvasKey });
        const previousData = queryClient.getQueryData<any>(canvasKey);
        const tempId = getTempId();
        
        if (previousData) {
          queryClient.setQueryData(canvasKey, {
            ...previousData,
            contents: [
              ...previousData.contents,
              {
                id: tempId, // 임시 ID
                title: newContent.title,
                status: (newContent as any).status || "draft",
                positionX: newContent.positionX || 0,
                positionY: newContent.positionY || 0,
                topicId: newContent.topicId || null,
                studioId: newContent.studioId,
                authorName: "나", // 낙관적 업데이트를 위한 임시 값
                viewCount: 0,
                commentCount: 0,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
          });
        }
        
        // 반환값에 tempId를 포함하여 나중에 활용 가능하도록 함 (물론 실제 onSuccess에서는 진짜 DB id를 받음)
        return { previousData, tempId };
      },
      onError: (_err, _newContent, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(canvasKey, context.previousData);
        }
      },
      onSuccess: () => { setTimeout(invalidateCanvas, 100); },
    })
  );

  const updateContent = useMutation(
    trpc.contentStudio.updateContent.mutationOptions()
  );

  const deleteContent = useMutation(
    trpc.contentStudio.deleteContent.mutationOptions({ onSuccess: invalidateCanvas })
  );

  const updateNodePositions = useMutation(
    trpc.contentStudio.updateNodePositions.mutationOptions({
      onMutate: async (variables) => {
        await queryClient.cancelQueries({ queryKey: canvasKey });
        const previousData = queryClient.getQueryData<any>(canvasKey);
        
        if (previousData) {
          // 낙관적으로 서버 데이터의 위치를 모두 갱신
          const newTopics = previousData.topics.map((t: any) => {
            const update = variables.updates.find(u => u.type === 'topic' && u.id === t.id);
            if (update) return { ...t, positionX: update.positionX, positionY: update.positionY };
            return t;
          });
          
          const newContents = previousData.contents.map((c: any) => {
            const update = variables.updates.find(u => u.type === 'content' && u.id === c.id);
            if (update) return { ...c, positionX: update.positionX, positionY: update.positionY };
            return c;
          });
          
          queryClient.setQueryData(canvasKey, {
            ...previousData,
            topics: newTopics,
            contents: newContents,
          });
        }
        return { previousData };
      },
      onError: (_err, _vars, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(canvasKey, context.previousData);
        }
      },
      // 노드 위치 업데이트 후에는 바로 invalidate하지 않고 조용히 냅둠 (깜빡임 방지)
    })
  );

  const createEdge = useMutation(
    trpc.contentStudio.createEdge.mutationOptions({
      onMutate: async (newEdge) => {
        await queryClient.cancelQueries({ queryKey: canvasKey });
        const previousData = queryClient.getQueryData<any>(canvasKey);
        
        if (previousData) {
          queryClient.setQueryData(canvasKey, {
            ...previousData,
            edges: [
              ...previousData.edges,
              {
                id: getTempId(),
                ...newEdge,
                // Pass through handles if they were secretly attached
                sourceHandle: (newEdge as any).sourceHandle,
                targetHandle: (newEdge as any).targetHandle,
                createdAt: new Date().toISOString(),
              },
            ],
          });
        }
        return { previousData };
      },
      onError: (_err, _newEdge, context) => {
        if (context?.previousData) {
          queryClient.setQueryData(canvasKey, context.previousData);
        }
      },
      onSuccess: () => { setTimeout(invalidateCanvas, 100); },
    })
  );

  const deleteEdge = useMutation(
    trpc.contentStudio.deleteEdge.mutationOptions({ onSuccess: invalidateCanvas })
  );

  const addSeoSnapshot = useMutation(
    trpc.contentStudio.addSeoSnapshot.mutationOptions()
  );

  return {
    createTopic, updateTopic, deleteTopic,
    createContent, updateContent, deleteContent,
    updateNodePositions,
    createEdge, deleteEdge,
    addSeoSnapshot,
  };
}
