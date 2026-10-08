import { useLingui } from "@lingui/react/macro";
import { cn } from "@superset/ui/utils";
import { Check, Copy } from "lucide-react";
import { useCallback } from "react";
import { useCopyToClipboard } from "renderer/hooks/useCopyToClipboard";

const COPIED_MS = 1500;

/** Copies `text` and shows a check for a moment instead of a toast. */
export function CopyButton({
	className,
	iconClassName = "size-3.5",
	label,
	text,
}: {
	text: string;
	label: string;
	className?: string;
	iconClassName?: string;
}) {
	const { t } = useLingui();
	const { copied, copyToClipboard } = useCopyToClipboard(COPIED_MS);
	const copy = useCallback(() => {
		copyToClipboard(text).catch((error: unknown) => {
			console.error("[chat] copy failed", error);
		});
	}, [copyToClipboard, text]);
	return (
		<button
			aria-label={copied ? t({ message: "Copied" }) : label}
			className={cn(
				"rounded p-1 text-muted-foreground/60 transition-colors hover:bg-secondary hover:text-foreground",
				copied && "text-foreground",
				className,
			)}
			onClick={copy}
			type="button"
		>
			{copied ? (
				<Check className={iconClassName} />
			) : (
				<Copy className={iconClassName} />
			)}
		</button>
	);
}
