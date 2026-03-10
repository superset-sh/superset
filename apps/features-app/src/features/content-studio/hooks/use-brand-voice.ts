import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc";

export function useBrandProfile(studioId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.brandVoice.getProfile.queryOptions({ studioId }),
  );
}

export function useUpsertBrandProfile(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const profileKey = trpc.contentStudio.brandVoice.getProfile.queryKey({ studioId });

  const upsert = useMutation(
    trpc.contentStudio.brandVoice.upsertProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey }),
    }),
  );

  return { upsert };
}

export function useDeleteBrandProfile(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const profileKey = trpc.contentStudio.brandVoice.getProfile.queryKey({ studioId });

  const deleteProfile = useMutation(
    trpc.contentStudio.brandVoice.deleteProfile.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey }),
    }),
  );

  return { deleteProfile };
}

export function useSetActivePreset(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const profileKey = trpc.contentStudio.brandVoice.getProfile.queryKey({ studioId });

  const setPreset = useMutation(
    trpc.contentStudio.brandVoice.setActivePreset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: profileKey }),
    }),
  );

  return { setPreset };
}

export function useTonePresets(studioId: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.contentStudio.brandVoice.presets.queryOptions({ studioId }),
  );
}

export function usePresetMutations(studioId: string) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const presetsKey = trpc.contentStudio.brandVoice.presets.queryKey({ studioId });
  const profileKey = trpc.contentStudio.brandVoice.getProfile.queryKey({ studioId });

  const createPreset = useMutation(
    trpc.contentStudio.brandVoice.createPreset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
    }),
  );

  const updatePreset = useMutation(
    trpc.contentStudio.brandVoice.updatePreset.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: presetsKey }),
    }),
  );

  const deletePreset = useMutation(
    trpc.contentStudio.brandVoice.deletePreset.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: presetsKey });
        queryClient.invalidateQueries({ queryKey: profileKey });
      },
    }),
  );

  return { createPreset, updatePreset, deletePreset };
}

export function useSuggestAlternatives() {
  const trpc = useTRPC();

  const suggest = useMutation(
    trpc.contentStudio.brandVoice.suggestAlternatives.mutationOptions(),
  );

  return { suggest };
}
