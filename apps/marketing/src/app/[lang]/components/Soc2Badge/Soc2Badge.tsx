import { useLingui } from "@lingui/react/macro";
import { useId } from "react";

interface Soc2BadgeProps {
	size?: number;
	className?: string;
}

export function Soc2Badge({ size = 96, className }: Soc2BadgeProps) {
	const { t } = useLingui();
	const ringId = useId();
	const badgeLabel = t({
		message: "SOC 2 Type II compliant",
	});

	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 120 120"
			fill="none"
			role="img"
			aria-label={badgeLabel}
			className={className}
		>
			<title>{badgeLabel}</title>
			<circle
				cx="60"
				cy="60"
				r="58.5"
				stroke="currentColor"
				strokeOpacity="0.25"
			/>
			<circle
				cx="60"
				cy="60"
				r="41.5"
				stroke="currentColor"
				strokeOpacity="0.25"
			/>
			<defs>
				{/* Top arc runs clockwise, bottom arc counterclockwise on a wider
				    radius, so both halves read upright inside the same band */}
				<path id={`${ringId}-top`} d="M 10,60 A 50,50 0 0 1 110,60" />
				<path id={`${ringId}-bottom`} d="M 4,60 A 56,56 0 0 0 116,60" />
			</defs>
			<text
				textAnchor="middle"
				fontSize="6.5"
				letterSpacing="1.1"
				fill="currentColor"
				fillOpacity="0.7"
				style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
			>
				<textPath href={`#${ringId}-top`} startOffset="50%">
					SERVICE ORGANIZATION CONTROLS
				</textPath>
			</text>
			<text
				textAnchor="middle"
				fontSize="6.5"
				letterSpacing="1.1"
				fill="currentColor"
				fillOpacity="0.7"
				style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
			>
				<textPath href={`#${ringId}-bottom`} startOffset="50%">
					INDEPENDENTLY AUDITED
				</textPath>
			</text>
			<circle cx="10" cy="60" r="1" fill="currentColor" fillOpacity="0.5" />
			<circle cx="110" cy="60" r="1" fill="currentColor" fillOpacity="0.5" />
			<circle cx="60" cy="44" r="2.5" fill="var(--color-brand)" />
			<text
				x="60"
				y="66"
				textAnchor="middle"
				fontSize="17"
				fontWeight="500"
				fill="currentColor"
				style={{ fontFamily: "var(--font-inter), sans-serif" }}
			>
				SOC 2
			</text>
			<text
				x="60"
				y="80"
				textAnchor="middle"
				fontSize="7"
				letterSpacing="2"
				fill="currentColor"
				fillOpacity="0.7"
				style={{ fontFamily: "var(--font-ibm-plex-mono), monospace" }}
			>
				TYPE II
			</text>
		</svg>
	);
}
