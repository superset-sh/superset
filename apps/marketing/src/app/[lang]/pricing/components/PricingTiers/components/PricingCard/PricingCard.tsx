import type { MessageDescriptor } from "@lingui/core";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@superset/ui/button";
import { cn } from "@superset/ui/utils";
import { Check } from "lucide-react";
import Link from "next/link";
import type { PricingTier } from "../../../../constants";

interface PricingCardProps {
	tier: PricingTier;
	isYearly: boolean;
}

export function PricingCard({ tier, isYearly }: PricingCardProps) {
	const { t } = useLingui();
	const { display, strikethrough, note, cadence } = resolvePrice(
		tier,
		isYearly,
	);

	return (
		<div
			className={cn(
				"flex flex-col gap-6 rounded-lg border p-6 md:p-8",
				tier.highlight
					? "border-foreground/30 bg-accent/20"
					: "border-border bg-card/40",
			)}
		>
			<div className="flex flex-col gap-1">
				<div className="flex items-center justify-between">
					<h3 className="text-lg font-medium text-foreground">
						{t(tier.name)}
					</h3>
					{tier.highlight && (
						<span className="rounded-sm bg-foreground px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-background">
							<Trans>Popular</Trans>
						</span>
					)}
				</div>
				<p className="text-sm text-muted-foreground">{t(tier.description)}</p>
			</div>

			<div className="flex flex-col gap-1">
				<div className="flex h-10 items-baseline gap-2">
					{strikethrough && (
						<span className="text-2xl font-medium tracking-tight leading-none text-muted-foreground line-through">
							{strikethrough}
						</span>
					)}
					<span className="text-4xl font-medium tracking-tight leading-none text-foreground">
						{typeof display === "string" ? display : t(display)}
					</span>
					{note && (
						<span className="text-sm leading-none text-muted-foreground">
							{t(note)}
						</span>
					)}
				</div>
				{cadence && (
					<p className="text-xs text-muted-foreground">{t(cadence)}</p>
				)}
			</div>

			<div className="flex flex-col gap-2">
				<Button asChild variant={tier.cta.variant} size="lg" className="w-full">
					{tier.cta.external ? (
						<a href={tier.cta.href} target="_blank" rel="noopener noreferrer">
							{t(tier.cta.label)}
						</a>
					) : (
						<Link href={tier.cta.href}>{t(tier.cta.label)}</Link>
					)}
				</Button>
				<CtaNote note={tier.ctaNote} />
			</div>

			<ul className="flex flex-col gap-3 border-t border-border pt-6">
				{tier.features.map((feature) => (
					<li
						key={feature.id}
						className="flex items-start gap-2.5 text-sm text-foreground"
					>
						<Check className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
						<span>{t(feature.label)}</span>
					</li>
				))}
			</ul>
		</div>
	);
}

function CtaNote({ note }: { note: PricingTier["ctaNote"] }) {
	const { t } = useLingui();
	if (!note) {
		return <p className="h-4" aria-hidden="true" />;
	}
	if (note.href) {
		return (
			<a
				href={note.href}
				target="_blank"
				rel="noopener noreferrer"
				className="text-center text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
			>
				{t(note.label)}
			</a>
		);
	}
	return (
		<p className="text-center text-xs text-muted-foreground">{t(note.label)}</p>
	);
}

function resolvePrice(
	tier: PricingTier,
	isYearly: boolean,
): {
	display: string | MessageDescriptor;
	strikethrough: string | null;
	note: MessageDescriptor | null;
	cadence: MessageDescriptor | null;
} {
	if (tier.price.kind === "fixed" || tier.price.kind === "custom") {
		return {
			display: tier.price.display,
			strikethrough: null,
			note: null,
			cadence: tier.price.note,
		};
	}
	const entry = isYearly ? tier.price.yearly : tier.price.monthly;
	return {
		display: entry.display,
		strikethrough: isYearly ? tier.price.monthly.display : null,
		note: entry.note,
		cadence: entry.cadence,
	};
}
