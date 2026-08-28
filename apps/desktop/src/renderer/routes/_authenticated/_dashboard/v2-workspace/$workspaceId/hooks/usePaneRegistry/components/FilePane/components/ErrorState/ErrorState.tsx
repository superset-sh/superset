import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";

export type ErrorReason =
	| "not-found"
	| "too-large"
	| "is-directory"
	| "binary-unsupported"
	| "load-failed";

interface ErrorStateProps {
	reason: ErrorReason;
	message?: string;
	onOpenAnyway?: () => void;
	onRetry?: () => void;
}

const MESSAGES: Record<ErrorReason, MessageDescriptor> = {
	"not-found": msg({
		id: "workspace.filePane.errorNotFound",
		message: "File not found",
	}),
	"too-large": msg({
		id: "workspace.filePane.errorTooLarge",
		message: "File is too large to preview",
	}),
	"is-directory": msg({
		id: "workspace.filePane.errorIsDirectory",
		message: "This path is a directory",
	}),
	"binary-unsupported": msg({
		id: "workspace.filePane.errorBinaryUnsupported",
		message: "Binary file — cannot display",
	}),
	"load-failed": msg({
		id: "workspace.filePane.errorLoadFailed",
		message: "Failed to load file",
	}),
};

export function ErrorState({
	reason,
	message,
	onOpenAnyway,
	onRetry,
}: ErrorStateProps) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<span className="select-text cursor-text">
				{message ?? i18n._(MESSAGES[reason])}
			</span>
			{reason === "too-large" && onOpenAnyway && (
				<Button variant="outline" size="sm" onClick={onOpenAnyway}>
					<Trans id="workspace.filePane.openAnyway">Open anyway</Trans>
				</Button>
			)}
			{reason === "load-failed" && onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<Trans id="workspace.filePane.retryLoad">Retry</Trans>
				</Button>
			)}
		</div>
	);
}
