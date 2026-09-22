import { Trans } from "@lingui/react/macro";

interface ExternalChangeBannerProps {
	onCompare: () => void;
}

export function ExternalChangeBanner({ onCompare }: ExternalChangeBannerProps) {
	return (
		<output className="flex items-center gap-3 border-b border-border bg-muted px-3 py-2 text-xs">
			<span className="flex-1">
				<Trans>The file changed on disk. Review it before saving again.</Trans>
			</span>
			<button
				type="button"
				onClick={onCompare}
				className="shrink-0 underline hover:no-underline"
			>
				<Trans>Compare</Trans>
			</button>
		</output>
	);
}
