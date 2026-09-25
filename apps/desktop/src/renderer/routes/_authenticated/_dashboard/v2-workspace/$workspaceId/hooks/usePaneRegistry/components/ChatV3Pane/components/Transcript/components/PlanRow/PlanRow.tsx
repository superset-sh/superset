import { Trans } from "@lingui/react/macro";
import type { Plan } from "@superset/chat/protocol";
import { CheckCircle2, Circle, CircleDotDashed } from "lucide-react";

const ICON_BY_STATUS = {
	pending: Circle,
	in_progress: CircleDotDashed,
	completed: CheckCircle2,
} as const;

export function PlanRow({ item }: { item: Plan }) {
	return (
		<div className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 p-2">
			<span className="text-xs font-medium text-muted-foreground">
				<Trans>Plan</Trans>
			</span>
			{item.entries.map((entry, index) => {
				const Icon = ICON_BY_STATUS[entry.status];
				return (
					<div
						className="flex items-start gap-2 text-sm"
						key={`${item.id}:${index}`}
					>
						<Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
						<span
							className={
								entry.status === "completed"
									? "text-muted-foreground line-through"
									: undefined
							}
						>
							{entry.text}
						</span>
					</div>
				);
			})}
		</div>
	);
}
