import { Trans } from "@lingui/react/macro";
import { errorMessage } from "@superset/i18n/errors";
import { Tooltip, TooltipContent, TooltipTrigger } from "@superset/ui/tooltip";
import { getBranchLoadFailure } from "../../utils/getBranchLoadFailure";

const ACTION_CLASS =
	"shrink-0 text-muted-foreground underline-offset-2 hover:text-foreground hover:underline disabled:no-underline disabled:opacity-60";

interface BranchLoadFailureProps {
	error: unknown;
	isRetrying: boolean;
	onRetry: () => void;
	onChangeProjectLocation?: () => void;
}

export function BranchLoadFailure({
	error,
	isRetrying,
	onRetry,
	onChangeProjectLocation,
}: BranchLoadFailureProps) {
	const failure = getBranchLoadFailure(error);
	const canChangeLocation =
		failure.kind === "project-dir-missing" && !!onChangeProjectLocation;
	return (
		<span className="flex min-w-0 items-center gap-1.5 text-[11px]">
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						// biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard users reach the reason through focus
						tabIndex={0}
						className="min-w-0 cursor-help truncate rounded-sm text-destructive outline-none focus-visible:ring-1 focus-visible:ring-ring"
					>
						{failure.kind === "project-dir-missing" ? (
							<Trans>Folder is missing</Trans>
						) : failure.kind === "host-unreachable" ? (
							<Trans>Can't reach the host</Trans>
						) : (
							<Trans>Failed to load branches</Trans>
						)}
					</span>
				</TooltipTrigger>
				<TooltipContent className="max-w-80 break-words">
					{failure.kind === "project-dir-missing"
						? failure.repoPath
						: errorMessage(error)}
				</TooltipContent>
			</Tooltip>
			{canChangeLocation ? (
				<button
					type="button"
					onClick={onChangeProjectLocation}
					className={ACTION_CLASS}
				>
					<Trans>Change location</Trans>
				</button>
			) : (
				<button
					type="button"
					onClick={onRetry}
					disabled={isRetrying}
					className={ACTION_CLASS}
				>
					{isRetrying ? <Trans>Retrying…</Trans> : <Trans>Retry</Trans>}
				</button>
			)}
		</span>
	);
}
