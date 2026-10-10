"use client";

import { Trans } from "@lingui/react/macro";
import { useFormat } from "@superset/i18n/react";
import type { RouterOutputs } from "@superset/trpc";
import { Badge } from "@superset/ui/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@superset/ui/table";
import { cn } from "@superset/ui/utils";

import { useHiringLabels } from "../../hooks/useHiringLabels";
import { isoDateFromToday, parseIsoDate } from "../../utils/isoDate";

export type ApplicationRow = RouterOutputs["hiring"]["list"][number];

interface ApplicationsTableProps {
	rows: ApplicationRow[];
	onOpen: (candidateId: string) => void;
}

export function ApplicationsTable({ rows, onOpen }: ApplicationsTableProps) {
	const labels = useHiringLabels();
	const { formatDate, formatCompactRelativeTime } = useFormat();
	const today = isoDateFromToday();

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>
						<Trans>Candidate</Trans>
					</TableHead>
					<TableHead>
						<Trans>Role</Trans>
					</TableHead>
					<TableHead>
						<Trans>Stage</Trans>
					</TableHead>
					<TableHead>
						<Trans>Owner</Trans>
					</TableHead>
					<TableHead>
						<Trans>Next step</Trans>
					</TableHead>
					<TableHead>
						<Trans>Follow-up</Trans>
					</TableHead>
					<TableHead>
						<Trans>Last contact</Trans>
					</TableHead>
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row) => (
					<TableRow
						key={row.applicationId}
						className="cursor-pointer"
						onClick={() => onOpen(row.candidateId)}
					>
						<TableCell>
							<div className="font-medium">{row.name}</div>
							<div className="text-muted-foreground text-xs">
								{[row.currentTitle, row.currentCompany]
									.filter(Boolean)
									.join(" · ")}
							</div>
						</TableCell>
						<TableCell className="text-sm">{row.roleTitle}</TableCell>
						<TableCell>
							<div className="flex items-center gap-1.5">
								<Badge variant="secondary">{labels.stage[row.stage]}</Badge>
								{row.outcome !== "active" && (
									<Badge
										variant={row.outcome === "hired" ? "default" : "outline"}
									>
										{labels.outcome[row.outcome]}
									</Badge>
								)}
							</div>
						</TableCell>
						<TableCell className="text-sm">{row.ownerName}</TableCell>
						<TableCell className="max-w-64 truncate text-sm">
							{row.nextStep}
						</TableCell>
						<TableCell
							className={cn(
								"text-sm tabular-nums",
								row.outcome === "active" &&
									row.nextFollowUpOn &&
									row.nextFollowUpOn < today &&
									"text-destructive font-medium",
							)}
						>
							{row.nextFollowUpOn &&
								formatDate(parseIsoDate(row.nextFollowUpOn), {
									month: "short",
									day: "numeric",
								})}
						</TableCell>
						<TableCell className="text-muted-foreground text-sm">
							{row.lastContactedAt &&
								formatCompactRelativeTime(new Date(row.lastContactedAt))}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
