import { Trans, useLingui } from "@lingui/react/macro";
import { useSessionStatus } from "renderer/lib/auth-client";

interface ServerUnreachableNoticeProps {
	isCollapsed: boolean;
}

export function ServerUnreachableNotice({
	isCollapsed,
}: ServerUnreachableNoticeProps) {
	const { t } = useLingui();
	const sessionStatus = useSessionStatus();
	if (sessionStatus !== "unconfirmed") return null;

	const title = t({ message: "Can't reach Superset" });
	if (isCollapsed) {
		return (
			<div className="flex justify-center py-1" title={title}>
				<span className="size-1.5 rounded-full bg-amber-500" />
			</div>
		);
	}
	return (
		<div className="mx-2 mb-1 flex items-center gap-2 rounded-md border border-border px-2 py-1.5 text-xs text-muted-foreground">
			<span className="size-1.5 shrink-0 rounded-full bg-amber-500" />
			<span className="min-w-0 truncate">
				{title} · <Trans>Retrying…</Trans>
			</span>
		</div>
	);
}
