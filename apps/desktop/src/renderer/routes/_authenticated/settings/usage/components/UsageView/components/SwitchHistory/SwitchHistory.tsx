import { Trans, useLingui } from "@lingui/react/macro";
import { formatDateTime, formatPercent } from "@superset/i18n/format";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";
import { windowLabel } from "renderer/routes/_authenticated/utils/windowLabel";
import type { EngineAgent } from "../../../../hooks/useAccountEngineSettings";
import type { SwitchHistoryEntry } from "../../../../hooks/useSwitchHistory";

interface SwitchHistoryProps {
	entries: SwitchHistoryEntry[];
	isLoading: boolean;
	/** The host could not be read: an empty table would claim nothing happened. */
	isError: boolean;
	/** Brand names, supplied by the page so both surfaces title an agent alike. */
	agentLabels: Record<EngineAgent, string>;
	/** Follows the page toggle, so a screenshot of the page hides the emails
	 * here too — the account cards blur theirs the same way. */
	hideEmails: boolean;
}

/**
 * R21. The engine records structured rows (KTD6) and the sentence is composed
 * here, so a switch that happened while the user was away reads in their own
 * language and their own date format.
 */
export function SwitchHistory({
	entries,
	isLoading,
	isError,
	agentLabels,
	hideEmails,
}: SwitchHistoryProps) {
	const { t } = useLingui();
	const unknownAccount = t({
		message: "Unknown account",
	});
	const hiddenEmail = t({
		message: "Email hidden",
	});

	const accountLabel = (label: string | null): string =>
		hideEmails && label ? hiddenEmail : (label ?? unknownAccount);

	const reasonText = (entry: SwitchHistoryEntry): string => {
		switch (entry.reasonKind) {
			case "threshold":
				return entry.windowId && typeof entry.usedPercent === "number"
					? t({
							message: `${windowLabel(entry.windowId)} at ${formatPercent(entry.usedPercent / 100, { maximumFractionDigits: 0 })}`,
						})
					: t({
							message: "Near the limit",
						});
			case "strategy":
				return t({
					message: "More headroom elsewhere",
				});
			case "manual":
				return t({
					message: "You picked this account",
				});
			case "fallback":
				return t({
					message: "Limit hit — session restarted",
				});
			case "fallback-rejected":
				return t({
					message: "Limit report not confirmed — no switch",
				});
			default:
				return t({
					message: "Account changed outside Superset",
				});
		}
	};

	const triggerText = (entry: SwitchHistoryEntry): string =>
		entry.reasonKind === "manual"
			? t({
					message: "Manual",
					context: "account switch trigger",
				})
			: entry.reasonKind === "external"
				? t({
						message: "Outside Superset",
						context: "account switch trigger",
					})
				: t({
						message: "Automatic",
						context: "account switch trigger",
					});

	return (
		<section className="flex flex-col gap-1.5">
			<span className="text-xs font-medium">
				<Trans>Switch history</Trans>
			</span>
			{isLoading ? (
				<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
					<Trans>Reading switch history…</Trans>
				</div>
			) : isError ? (
				<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
					<Trans>
						History is unavailable right now. Reopen this page to try again.
					</Trans>
				</div>
			) : entries.length === 0 ? (
				<div className="rounded-lg border border-dashed px-3 py-2 text-[11px] text-muted-foreground">
					<Trans>
						No account switches yet. Every switch, automatic or by hand, is
						listed here.
					</Trans>
				</div>
			) : (
				<div className="overflow-x-auto rounded-lg border">
					<Table className="text-[11px]">
						<TableHeader>
							<TableRow>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">When</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">Agent</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">From</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">To</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">Why</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">Trigger</Trans>
								</TableHead>
								<TableHead className="h-7 px-2 text-[10px] font-medium">
									<Trans context="switch history column">Sessions</Trans>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map((entry) => (
								<TableRow
									key={`${entry.at}-${entry.agent}-${entry.reasonKind}`}
								>
									<TableCell className="whitespace-nowrap px-2 py-1 text-muted-foreground tabular-nums">
										{formatDateTime(entry.at, {
											month: "short",
											day: "numeric",
											hour: "numeric",
											minute: "2-digit",
										})}
									</TableCell>
									<TableCell className="px-2 py-1">
										{agentLabels[entry.agent]}
									</TableCell>
									<TableCell
										className={cn(
											"max-w-[12rem] truncate px-2 py-1 text-muted-foreground",
											hideEmails && entry.fromLabel && "select-none blur-[5px]",
										)}
									>
										{accountLabel(entry.fromLabel)}
									</TableCell>
									<TableCell
										className={cn(
											"max-w-[12rem] truncate px-2 py-1",
											hideEmails && entry.toLabel && "select-none blur-[5px]",
										)}
									>
										{accountLabel(entry.toLabel)}
									</TableCell>
									<TableCell className="px-2 py-1 text-muted-foreground">
										{reasonText(entry)}
									</TableCell>
									<TableCell className="px-2 py-1 text-muted-foreground">
										{triggerText(entry)}
									</TableCell>
									<TableCell className="px-2 py-1 text-muted-foreground">
										{entry.fallbackRestart ? (
											<Trans>Restarted and resumed</Trans>
										) : (
											<span aria-hidden>—</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>
			)}
		</section>
	);
}
