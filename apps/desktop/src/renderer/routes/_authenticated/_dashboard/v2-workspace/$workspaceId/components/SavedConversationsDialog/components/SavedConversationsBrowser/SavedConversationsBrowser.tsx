import { useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useInfiniteQuery } from "@tanstack/react-query";
import { TRPCClientError } from "@trpc/client";
import { useEffect, useRef, useState } from "react";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import { historyRows } from "../../historyRows";
import { SavedConversationsForm } from "../SavedConversationsForm";
import { openHistoryRow } from "./openHistoryRow";

export interface SavedConversationsBrowserProps {
	hostUrl: string;
	workspaceId: string;
	agent: string;
	account: { selection: string | null; identity: string };
	accountLabel: string;
	onBack: () => void;
	onBusy: (busy: boolean) => void;
	onOpened: (terminalId: string) => void;
}

export function SavedConversationsBrowser({
	hostUrl,
	workspaceId,
	agent,
	account,
	accountLabel,
	onBack,
	onBusy,
	onOpened,
}: SavedConversationsBrowserProps) {
	const { t } = useLingui();
	const [pending, setPending] = useState(false);
	const active = useRef(true);
	const reportBusy = useRef(onBusy);
	useEffect(() => {
		reportBusy.current = onBusy;
	}, [onBusy]);
	useEffect(() => {
		active.current = true;
		return () => {
			active.current = false;
			reportBusy.current(false);
		};
	}, []);
	const client = getHostServiceClientByUrl(hostUrl);
	const input = { workspaceId, agent, account };
	const history = useInfiniteQuery({
		queryKey: [
			"saved-conversations",
			hostUrl,
			workspaceId,
			agent,
			account.selection,
			account.identity,
		],
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			client.savedConversations.list.query({
				...input,
				...(pageParam ? { cursor: pageParam } : {}),
			}),
		getNextPageParam: (page) => page.nextCursor ?? undefined,
		retry: false,
		refetchOnWindowFocus: false,
		staleTime: 0,
	});
	const unsupported =
		history.error instanceof TRPCClientError &&
		history.error.data?.code === "NOT_FOUND" &&
		history.error.message.includes("savedConversations");
	const error = unsupported
		? t({ message: "Update this host to open saved Claude history." })
		: history.isError
			? errorMessage(
					history.error,
					t({ message: "Could not load saved conversations" }),
				)
			: null;
	return (
		<SavedConversationsForm
			accountLabel={accountLabel}
			rows={historyRows(history.data?.pages ?? [])}
			loading={history.isPending}
			refreshing={history.isFetching}
			pending={pending}
			hasMore={history.hasNextPage}
			error={error}
			onBack={onBack}
			onRefresh={async () => {
				await history.refetch();
			}}
			onLoadMore={async () => {
				await history.fetchNextPage();
			}}
			onOpen={async (row, originalSessionExited) => {
				setPending(true);
				onBusy(true);
				try {
					const terminalId = await openHistoryRow({
						row,
						originalSessionExited,
						isCurrent: () => active.current,
						adopt: (candidate) =>
							client.savedConversations.adopt.mutate({
								...input,
								...candidate,
							}),
						open: (saved) =>
							client.savedConversations.open.mutate({ workspaceId, ...saved }),
					});
					if (terminalId) onOpened(terminalId);
				} finally {
					if (active.current) {
						await history.refetch();
						if (active.current) {
							setPending(false);
							onBusy(false);
						}
					}
				}
			}}
		/>
	);
}
