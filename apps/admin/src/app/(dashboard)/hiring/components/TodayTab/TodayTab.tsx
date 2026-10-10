"use client";

import { Trans, useLingui } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LuClock } from "react-icons/lu";

import { useTRPC } from "@/trpc/react";

import { useHiringLabels } from "../../hooks/useHiringLabels";
import { useInvalidateHiring } from "../../hooks/useInvalidateHiring";
import { useSearchParamState } from "../../hooks/useSearchParamState";
import { isoDateFromToday, parseIsoDate } from "../../utils/isoDate";
import { CandidateView } from "../CandidateView";

const SNOOZE_DAYS = 3;

export function TodayTab() {
	const { t } = useLingui();
	const trpc = useTRPC();
	const labels = useHiringLabels();
	const { formatDate } = useFormat();
	const invalidate = useInvalidateHiring();
	const [selectedParam, setSelected] = useSearchParamState("candidate");
	const today = useQuery(trpc.hiring.today.queryOptions());
	const snooze = useMutation(
		trpc.hiring.updateApplication.mutationOptions({ onSuccess: invalidate }),
	);

	const rows = today.data ?? [];
	const ids = rows.map((row) => row.candidateId);
	const [cursor, setCursor] = useState(0);
	const foundIndex = selectedParam ? ids.indexOf(selectedParam) : -1;
	// A candidate leaves the list once touched or snoozed; keep the cursor where it was.
	const index =
		foundIndex !== -1 ? foundIndex : Math.min(cursor, ids.length - 1);
	const selectedId = ids[index] ?? null;

	useEffect(() => {
		if (foundIndex !== -1) setCursor(foundIndex);
	}, [foundIndex]);

	const prevId = ids[index - 1];
	const nextId = ids[index + 1];
	const goPrev = useCallback(
		() => prevId && setSelected(prevId),
		[prevId, setSelected],
	);
	const goNext = useCallback(
		() => nextId && setSelected(nextId),
		[nextId, setSelected],
	);

	if (today.data && rows.length === 0) {
		return (
			<p className="text-muted-foreground py-16 text-center text-sm">
				<Trans>No follow-ups due. Nice.</Trans>
			</p>
		);
	}

	const todayIso = isoDateFromToday();

	return (
		<div className="@container">
			<div className="grid gap-6 @5xl:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
				<ol className="space-y-1">
					{rows.map((row) => {
						const isSelected = row.candidateId === selectedId;
						const due = row.nextFollowUpOn;
						return (
							<li key={row.applicationId}>
								<div
									className={cn(
										"group hover:bg-accent/60 flex items-start gap-2 rounded-md px-3 py-2",
										isSelected && "bg-accent",
									)}
								>
									<button
										type="button"
										onClick={() => setSelected(row.candidateId)}
										className="min-w-0 flex-1 text-left"
									>
										<div className="flex items-center justify-between gap-2">
											<span className="truncate text-sm font-medium">
												{row.name}
											</span>
											{due && (
												<span
													className={cn(
														"shrink-0 text-xs tabular-nums",
														due < todayIso
															? "text-destructive"
															: "text-muted-foreground",
													)}
												>
													{formatDate(parseIsoDate(due), {
														month: "short",
														day: "numeric",
													})}
												</span>
											)}
										</div>
										<div className="text-muted-foreground truncate text-xs">
											{labels.stage[row.stage]} · {row.roleTitle}
										</div>
										{row.nextStep && (
											<div className="text-muted-foreground mt-0.5 line-clamp-2 text-xs">
												{row.nextStep}
											</div>
										)}
									</button>
									<Button
										size="icon"
										variant="ghost"
										className="size-7 shrink-0 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
										title={t({ message: "Snooze 3 days" })}
										aria-label={t({ message: "Snooze 3 days" })}
										disabled={snooze.isPending}
										onClick={() =>
											snooze.mutate({
												applicationId: row.applicationId,
												nextFollowUpOn: isoDateFromToday(SNOOZE_DAYS),
											})
										}
									>
										<LuClock className="size-3.5" />
									</Button>
								</div>
							</li>
						);
					})}
				</ol>
				{selectedId && (
					<CandidateView
						candidateId={selectedId}
						position={{ index, total: ids.length }}
						onPrev={prevId ? goPrev : undefined}
						onNext={nextId ? goNext : undefined}
					/>
				)}
			</div>
		</div>
	);
}
