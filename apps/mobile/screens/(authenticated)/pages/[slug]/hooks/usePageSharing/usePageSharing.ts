import type { RouterOutputs } from "@superset/trpc";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { apiClient } from "@/lib/trpc/client";

export type PageVisibility = "just_me" | "org";
export type PageVersion = RouterOutputs["page"]["versions"][number];

export function usePageAccessQuery(slug: string | undefined) {
	return useQuery({
		queryKey: ["cloud", "page", "access", slug],
		enabled: Boolean(slug),
		queryFn: () => apiClient.page.access.query({ slug: slug as string }),
	});
}

export function usePageVersionsQuery(slug: string | undefined) {
	return useQuery({
		queryKey: ["cloud", "page", "versions", slug],
		enabled: Boolean(slug),
		queryFn: () => apiClient.page.versions.query({ slug: slug as string }),
	});
}

export function usePageSharingActions(
	pageId: string | undefined,
	slug: string | undefined,
) {
	const queryClient = useQueryClient();
	// The pulled page carries both visibility and sharedVersion, so it is what
	// the sheet renders from and what has to be refetched after either change.
	const invalidate = useCallback(() => {
		void queryClient.invalidateQueries({
			queryKey: ["cloud", "page", "pull", slug],
		});
		void queryClient.invalidateQueries({ queryKey: ["cloud", "page", "list"] });
	}, [queryClient, slug]);

	const setVisibility = useMutation({
		mutationFn: (visibility: PageVisibility) =>
			apiClient.page.setVisibility.mutate({
				id: pageId as string,
				visibility,
			}),
		onSuccess: invalidate,
	});

	const setSharedVersion = useMutation({
		mutationFn: (version: number | null) =>
			apiClient.page.setSharedVersion.mutate({ id: pageId as string, version }),
		onSuccess: invalidate,
	});

	return { setVisibility, setSharedVersion };
}
