import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { Trans } from "@lingui/react/macro";
import { i18n } from "@superset/i18n";
import { Button } from "@superset/ui/button";
import type { ReactNode } from "react";

export type ErrorReason =
	| "not-found"
	| "too-large"
	| "is-directory"
	| "binary-unsupported"
	| "load-failed";

interface ErrorStateProps {
	reason: ErrorReason;
	message?: string;
	detail?: string;
	action?: ReactNode;
	onOpenAnyway?: () => void;
	onRetry?: () => void;
}

const MESSAGES: Record<ErrorReason, MessageDescriptor> = {
	"not-found": msg({
		message: "File not found",
	}),
	"too-large": msg({
		message: "File is too large to preview",
	}),
	"is-directory": msg({
		message: "This path is a directory",
	}),
	"binary-unsupported": msg({
		message: "Binary file — cannot display",
	}),
	"load-failed": msg({
		message: "Failed to load file",
	}),
};

export function ErrorState({
	reason,
	message,
	detail,
	action,
	onOpenAnyway,
	onRetry,
}: ErrorStateProps) {
	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
			<span className="select-text cursor-text">
				{message ?? i18n._(MESSAGES[reason])}
			</span>
			{detail && (
				<span className="max-w-md cursor-text select-text text-center text-xs text-muted-foreground/70">
					{detail}
				</span>
			)}
			{action}
			{reason === "too-large" && onOpenAnyway && (
				<Button variant="outline" size="sm" onClick={onOpenAnyway}>
					<Trans>Open anyway</Trans>
				</Button>
			)}
			{reason === "load-failed" && onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<Trans>Retry</Trans>
				</Button>
			)}
		</div>
	);
}
