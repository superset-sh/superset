import { useLingui } from "@lingui/react/macro";
import type {
	ComposerMentionEntry,
	ComposerMentionProvider,
} from "@superset/chat-ui/PromptInput";
import { useCallback, useMemo } from "react";
import { env } from "renderer/env.renderer";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { pagesListInput } from "renderer/routes/_authenticated/_dashboard/utils/pagesListInput";

export function usePageMentionProvider(): ComposerMentionProvider {
	const { t } = useLingui();
	const cloudUtils = cloudTrpc.useUtils();
	const searchPages = useCallback(
		async (query: string) => {
			const { items } = await cloudUtils.page.listPaginated.fetch(
				pagesListInput({ search: query || undefined, limit: 20 }),
			);
			return items.map((page): ComposerMentionEntry => {
				const url = new URL(
					`/page/${encodeURIComponent(page.slug)}`,
					env.NEXT_PUBLIC_WEB_URL,
				).toString();
				return {
					id: page.id,
					label: page.title,
					description: page.slug,
					select: (ctx) =>
						ctx.insertChip({ label: page.title, serialized: url }),
				};
			});
		},
		[cloudUtils],
	);
	return useMemo(
		() => ({
			id: "pages",
			title: t({ message: "Pages" }),
			priority: 2,
			source: {
				kind: "search",
				search: searchPages,
				emptyState: t({ message: "No matching pages" }),
			},
		}),
		[searchPages, t],
	);
}
