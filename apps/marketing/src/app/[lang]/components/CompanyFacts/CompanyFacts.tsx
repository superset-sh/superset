import { Trans } from "@lingui/react/macro";
import { formatNumber } from "@superset/i18n/format";

const FOUNDER_COUNT = 4;
const DEVELOPER_COUNT = 100_000;

interface CompanyFactsProps {
	lang: string;
	className?: string;
}

export function CompanyFacts({ lang, className = "" }: CompanyFactsProps) {
	const founderCount = formatNumber(FOUNDER_COUNT, {}, lang);
	const developerCount = formatNumber(DEVELOPER_COUNT, {}, lang);

	return (
		<dl
			className={`grid grid-cols-1 gap-5 border-y border-border py-6 sm:grid-cols-3 sm:gap-x-8 sm:gap-y-2 ${className}`}
		>
			<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
				<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
					<Trans>Location</Trans>
				</dt>
				<dd className="m-0 text-xl leading-7 tracking-[-0.025em] sm:text-[26px] sm:leading-[34px]">
					<Trans>San Francisco</Trans>
				</dd>
			</div>
			<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
				<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
					<Trans>Team</Trans>
				</dt>
				<dd className="m-0 text-xl leading-7 tracking-[-0.025em] sm:text-[26px] sm:leading-[34px]">
					<Trans>{founderCount} ex-YC founders</Trans>
				</dd>
			</div>
			<div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-baseline gap-x-4 sm:row-span-2 sm:min-w-0 sm:grid-cols-1 sm:grid-rows-subgrid">
				<dt className="font-mono text-[11px] leading-4 tracking-[0.07em] text-muted-foreground uppercase sm:order-2">
					<Trans>Developers</Trans>
				</dt>
				<dd className="m-0 text-xl leading-7 tracking-[-0.025em] tabular-nums sm:text-[26px] sm:leading-[34px]">
					<Trans>{developerCount}+</Trans>
				</dd>
			</div>
		</dl>
	);
}
