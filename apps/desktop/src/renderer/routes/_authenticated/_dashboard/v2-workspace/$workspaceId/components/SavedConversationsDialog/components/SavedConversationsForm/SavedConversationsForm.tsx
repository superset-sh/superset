import { Trans, useLingui } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { useFormat } from "@superset/i18n/react";
import { BUILTIN_AGENT_LABELS } from "@superset/shared/agent-catalog";
import { Button } from "@superset/ui/button";
import { Loader2 } from "lucide-react";
import { useId, useRef, useState } from "react";
import type { SavedHistoryRow } from "../../historyRows";

export interface SavedConversationsFormProps {
	accountLabel: string;
	rows: SavedHistoryRow[];
	loading: boolean;
	refreshing: boolean;
	pending: boolean;
	hasMore: boolean;
	error: string | null;
	onBack: () => void;
	onRefresh: () => Promise<void>;
	onLoadMore: () => Promise<void>;
	onOpen: (
		row: SavedHistoryRow,
		originalSessionExited: boolean,
	) => Promise<void>;
}

export function SavedConversationsForm({
	accountLabel,
	rows,
	loading,
	refreshing,
	pending,
	hasMore,
	error,
	onBack,
	onRefresh,
	onLoadMore,
	onOpen,
}: SavedConversationsFormProps) {
	const { t } = useLingui();
	const { formatDateTime } = useFormat();
	const radioName = useId();
	const [selected, setSelected] = useState<string | null>(null);
	const [exited, setExited] = useState(false);
	const [openError, setOpenError] = useState<string | null>(null);
	const inFlight = useRef(false);
	const rowKey = (row: SavedHistoryRow) =>
		JSON.stringify([row.id, row.revision]);
	const chosen = rows.find((row) => rowKey(row) === selected);
	const busy = pending || refreshing || loading;
	const failure =
		error ??
		openError ??
		(selected && !chosen
			? t({
					message:
						"This saved history changed. Select it again before opening.",
				})
			: null);
	const canOpen =
		chosen && !busy && !error && (chosen.canFocusExisting || exited);
	return (
		<form
			className="min-w-0 space-y-4"
			onSubmit={async (event) => {
				event.preventDefault();
				if (!canOpen || !chosen || inFlight.current) return;
				inFlight.current = true;
				setOpenError(null);
				try {
					await onOpen(chosen, chosen.canFocusExisting ? false : exited);
				} catch (cause) {
					setOpenError(
						errorMessage(
							cause,
							t({ message: "Could not open saved conversation" }),
						),
					);
				} finally {
					inFlight.current = false;
				}
			}}
		>
			<div className="flex min-w-0 items-center justify-between gap-3">
				<span className="truncate text-sm" title={accountLabel}>
					{accountLabel}
				</span>
				<Button
					type="button"
					variant="ghost"
					size="sm"
					disabled={pending}
					onClick={onBack}
				>
					<Trans>Change account</Trans>
				</Button>
			</div>
			{loading ? (
				<output className="text-sm text-muted-foreground">
					<Trans>Loading saved conversations…</Trans>
				</output>
			) : null}
			{!loading && !error && rows.length === 0 ? (
				<p className="text-sm text-muted-foreground">
					<Trans>
						No saved Claude conversations were found in this account for the
						current workspace.
					</Trans>
				</p>
			) : null}
			<fieldset
				disabled={busy || Boolean(error)}
				className="max-h-72 space-y-1 overflow-y-auto"
			>
				<legend className="sr-only">
					<Trans>Saved conversations</Trans>
				</legend>
				{rows.map((row) => (
					<label
						key={row.id}
						className="flex min-w-0 cursor-pointer items-start gap-3 rounded-md border border-transparent px-3 py-2.5 hover:bg-accent has-[:checked]:border-border has-[:checked]:bg-accent"
					>
						<input
							type="radio"
							name={radioName}
							value={rowKey(row)}
							checked={selected === rowKey(row)}
							className="mt-1 shrink-0"
							onChange={() => {
								setSelected(rowKey(row));
								setExited(false);
								setOpenError(null);
							}}
						/>
						<span className="min-w-0 flex-1 space-y-1">
							<span className="block text-sm font-medium">
								{BUILTIN_AGENT_LABELS.claude} ·{" "}
								{row.nativeSessionId.slice(0, 8)}
							</span>
							<code
								className="block truncate text-xs text-muted-foreground"
								title={row.nativeSessionId}
							>
								{row.nativeSessionId}
							</code>
							<span className="block text-xs text-muted-foreground">
								{row.canFocusExisting ? (
									<Trans>Open existing terminal</Trans>
								) : row.conversationId ? (
									<Trans>Saved in Superset</Trans>
								) : row.lastModifiedAt === undefined ? null : (
									formatDateTime(row.lastModifiedAt, undefined)
								)}
							</span>
						</span>
					</label>
				))}
			</fieldset>
			{hasMore ? (
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={busy}
					onClick={() =>
						void onLoadMore().catch((cause) =>
							setOpenError(
								errorMessage(
									cause,
									t({ message: "Could not load saved conversations" }),
								),
							),
						)
					}
				>
					<Trans>Load more</Trans>
				</Button>
			) : null}
			{chosen && !chosen.canFocusExisting ? (
				<label className="flex items-start gap-2 text-sm text-muted-foreground">
					<input
						type="checkbox"
						checked={exited}
						disabled={busy}
						className="mt-1 shrink-0"
						onChange={(event) => setExited(event.target.checked)}
					/>
					<span>
						<Trans>
							I exited this conversation in the original app. No tools or
							background jobs are still running.
						</Trans>
					</span>
				</label>
			) : null}
			{failure ? (
				<p role="alert" className="text-sm text-destructive">
					{failure}
				</p>
			) : null}
			<div className="flex justify-between gap-2">
				<Button
					type="button"
					variant="ghost"
					disabled={busy}
					onClick={() =>
						void onRefresh().catch((cause) =>
							setOpenError(
								errorMessage(
									cause,
									t({ message: "Could not load saved conversations" }),
								),
							),
						)
					}
				>
					<Trans>Refresh</Trans>
				</Button>
				<Button type="submit" disabled={!canOpen}>
					{pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : null}
					{chosen?.canFocusExisting ? (
						<Trans>Open existing terminal</Trans>
					) : (
						<Trans>Open conversation</Trans>
					)}
				</Button>
			</div>
		</form>
	);
}
