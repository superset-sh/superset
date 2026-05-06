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

const MESSAGES: Record<ErrorReason, string> = {
	"not-found": "File not found",
	"too-large": "File is too large to preview",
	"is-directory": "This path is a directory",
	"binary-unsupported": "Binary file — cannot display",
	"load-failed": "Failed to load file",
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
				{message ?? MESSAGES[reason]}
			</span>
			{reason === "too-large" && onOpenAnyway && (
				<Button variant="outline" size="sm" onClick={onOpenAnyway}>
					Open anyway
				</Button>
			)}
			{reason === "load-failed" && onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					Retry
				</Button>
			)}
		</div>
	);
}
