import type { AppRouter } from "@superset/host-service";
import { formatCompactRelativeTime } from "@superset/i18n/format";
import type { inferRouterOutputs } from "@trpc/server";
import { Check } from "lucide-react";

type Commit =
	inferRouterOutputs<AppRouter>["git"]["listCommits"]["commits"][number];

interface CommitRowProps {
	commit: Commit;
	isSelected?: boolean;
	wrap?: boolean;
}

export function CommitRow({
	commit,
	isSelected,
	wrap = false,
}: CommitRowProps) {
	return (
		<div className="flex min-w-0 flex-1 items-start justify-between gap-2">
			<div className="min-w-0 flex-1 overflow-hidden">
				<div className={wrap ? "text-sm wrap-break-word" : "truncate text-sm"}>
					{commit.message}
				</div>
				<div className="truncate text-xs text-muted-foreground">
					{commit.shortHash} · {commit.author} ·{" "}
					{formatCompactRelativeTime(new Date(commit.date))}
				</div>
			</div>
			{isSelected && <Check className="mt-0.5 size-3.5 shrink-0" />}
		</div>
	);
}
