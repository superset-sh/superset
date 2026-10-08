export type RunStatus = "created" | "creating" | "failed";

const DOT_COLORS: Record<RunStatus, string> = {
	created: "bg-emerald-500",
	creating: "bg-amber-500",
	failed: "bg-red-500",
};

export function RunStatusDot({ status }: { status: RunStatus }) {
	return (
		<span
			className={`inline-block size-1.5 shrink-0 rounded-full ${DOT_COLORS[status]}`}
		/>
	);
}
