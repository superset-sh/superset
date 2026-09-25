import { Trans } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { LuFileCode, LuLoader } from "react-icons/lu";
import type { DeferredDiffReason } from "../../hooks/useDiffAnnotations";

interface DeferredDiffPlaceholderProps {
	reason: DeferredDiffReason;
	onRequest: () => void;
}

/** Stands in for a file whose diff isn't on screen: a generated artifact held
 * back on purpose, a patch still in flight, or one that failed to load. */
export function DeferredDiffPlaceholder({
	reason,
	onRequest,
}: DeferredDiffPlaceholderProps) {
	const isLoading = reason === "loading";

	return (
		<div className="flex flex-col items-center justify-center gap-3 bg-muted/30 py-8 text-muted-foreground">
			{isLoading ? (
				<LuLoader className="size-6 animate-spin" />
			) : (
				<LuFileCode className="size-8" />
			)}
			<p className="cursor-text select-text text-sm">
				{isLoading ? (
					<Trans>Loading diff…</Trans>
				) : reason === "error" ? (
					<Trans>Unable to load diff</Trans>
				) : (
					<Trans>Generated file hidden</Trans>
				)}
			</p>
			{reason === "deferred" ? (
				<Button variant="outline" size="sm" onClick={onRequest}>
					<Trans>Load diff</Trans>
				</Button>
			) : reason === "error" ? (
				<Button variant="outline" size="sm" onClick={onRequest}>
					<Trans>Retry</Trans>
				</Button>
			) : null}
		</div>
	);
}
