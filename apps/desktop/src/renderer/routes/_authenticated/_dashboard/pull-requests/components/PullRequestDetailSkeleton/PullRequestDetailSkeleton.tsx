import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { PullRequestSkeleton as Skeleton } from "../PullRequestSkeleton";

const BODY_LINES = [
	{ id: "first", width: "w-full" },
	{ id: "second", width: "w-11/12" },
	{ id: "third", width: "w-10/12" },
	{ id: "fourth", width: "w-full" },
	{ id: "fifth", width: "w-8/12" },
];

interface PullRequestDetailSkeletonProps {
	/** True for the Changes tab: a file card shape instead of the summary page. */
	variant?: "summary" | "diff";
	className?: string;
}

/** The page's shape while its detail (or the diff renderer) is on its way. */
export function PullRequestDetailSkeleton({
	variant = "summary",
	className,
}: PullRequestDetailSkeletonProps) {
	const { t } = useLingui();
	const label = t({ message: "Loading pull request…" });
	if (variant === "diff") {
		return (
			<output
				className={cn("flex min-h-0 flex-1 flex-col p-3", className)}
				aria-live="polite"
				aria-label={label}
			>
				<div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border/60">
					<div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
						<Skeleton className="h-4 w-40 rounded-full" />
						<Skeleton className="ml-auto h-4 w-16 rounded-full" />
					</div>
					<div className="space-y-2 px-3 py-4">
						{BODY_LINES.map(({ id, width }) => (
							<Skeleton key={id} className={cn("h-3 rounded-full", width)} />
						))}
					</div>
				</div>
				<span className="sr-only">{label}</span>
			</output>
		);
	}
	return (
		<output
			className={cn(
				"@container/detail block min-h-0 flex-1 overflow-hidden",
				className,
			)}
			aria-live="polite"
			aria-label={label}
		>
			<div className="mx-auto flex w-full max-w-[76rem] items-start gap-12 px-6 pt-4">
				<div className="min-w-0 flex-1 space-y-4">
					<div className="flex items-center gap-2">
						<Skeleton className="h-6 w-16 rounded-full" />
						<Skeleton className="h-3 w-24 rounded-full" />
					</div>
					<Skeleton className="h-8 w-4/5 rounded-md" />
					<div className="flex items-center gap-2">
						<Skeleton className="size-4 rounded-full" />
						<Skeleton className="h-3 w-24 rounded-full" />
						<Skeleton className="h-3 w-12 rounded-full" />
						<Skeleton className="h-3 w-32 rounded-full" />
					</div>
					<div className="space-y-2 pt-4">
						<Skeleton className="h-4 w-24 rounded-full" />
						{BODY_LINES.map(({ id, width }) => (
							<Skeleton key={id} className={cn("h-3 rounded-full", width)} />
						))}
					</div>
					<div className="space-y-2 pt-2">
						<Skeleton className="h-4 w-32 rounded-full" />
						{BODY_LINES.slice(0, 3).map(({ id, width }) => (
							<Skeleton key={id} className={cn("h-3 rounded-full", width)} />
						))}
					</div>
				</div>
				<aside className="hidden w-[22rem] shrink-0 space-y-7 @min-[52rem]/detail:block">
					{[0, 1, 2].map((section) => (
						<div key={section} className="space-y-2">
							<Skeleton className="h-3 w-20 rounded-full" />
							<Skeleton className="h-4 w-40 rounded-full" />
							{section === 2 ? (
								<>
									<Skeleton className="h-4 w-36 rounded-full" />
									<Skeleton className="h-4 w-44 rounded-full" />
								</>
							) : null}
						</div>
					))}
				</aside>
			</div>
			<span className="sr-only">{label}</span>
		</output>
	);
}
