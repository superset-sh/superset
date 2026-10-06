import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { Spinner } from "@superset/ui/spinner";
import { HiOutlineExclamationTriangle } from "react-icons/hi2";

interface OrganizationLoadErrorProps {
	onRetry: () => void;
	isRetrying: boolean;
}

export function OrganizationLoadError({
	onRetry,
	isRetrying,
}: OrganizationLoadErrorProps) {
	return (
		<div className="relative flex h-screen w-screen flex-col items-center justify-center gap-4 bg-background">
			<div className="drag absolute inset-x-0 top-0 h-12" />
			<HiOutlineExclamationTriangle className="size-12 text-muted-foreground" />
			<div className="text-center">
				<h2 className="text-lg font-medium">
					<Trans>Something went wrong</Trans>
				</h2>
				<p className="text-sm text-muted-foreground">
					<Trans>Check your connection and try again</Trans>
				</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				onClick={onRetry}
				disabled={isRetrying}
				className="gap-2"
			>
				{isRetrying && <Spinner className="size-3.5" />}
				<Trans>Retry</Trans>
			</Button>
		</div>
	);
}
