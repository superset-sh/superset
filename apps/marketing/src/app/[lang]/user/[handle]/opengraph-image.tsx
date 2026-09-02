import { COMPANY } from "@superset/shared/constants";
import { ImageResponse } from "next/og";
import { fetchParticipant } from "@/app/[lang]/utils/fetchLeaderboard";
import { formatTokens, formatUsd } from "@/app/[lang]/utils/formatUsage";
import { OgStat } from "./components/OgStat";
import { OG_BG, OG_BRAND, OG_DIM } from "./constants";
import { getInterBold } from "./utils/getInterBold";

export const alt = "Superset leaderboard profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const COMPANY_LABEL = `${COMPANY.NAME.toUpperCase()} LEADERBOARD`;

export default async function Image({
	params,
}: {
	params: Promise<{ handle: string }>;
}) {
	const { handle } = await params;
	const [profile, fontData] = await Promise.all([
		fetchParticipant(handle, { period: "all" }),
		getInterBold(),
	]);
	const fonts = [
		{
			name: "Inter",
			data: fontData,
			weight: 700 as const,
			style: "normal" as const,
		},
	];

	if (!profile) {
		return new ImageResponse(
			<div
				style={{
					background: OG_BG,
					width: "100%",
					height: "100%",
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					color: "#ffffff",
					fontSize: 48,
					fontFamily: "Inter",
				}}
			>
				{COMPANY_LABEL}
			</div>,
			{ ...size, fonts },
		);
	}

	const subtitle = `@${profile.handle} \u00b7 rank #${profile.rank} of ${profile.total}`;

	return new ImageResponse(
		<div
			style={{
				background: OG_BG,
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "64px 72px",
				fontFamily: "Inter",
			}}
		>
			<div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
				<div style={{ fontSize: 22, color: OG_BRAND, letterSpacing: 4 }}>
					{COMPANY_LABEL}
				</div>
				<div style={{ fontSize: 72, color: "#ffffff", lineHeight: 1.1 }}>
					{profile.name ?? `@${profile.handle}`}
				</div>
				<div style={{ fontSize: 26, color: OG_DIM }}>{subtitle}</div>
			</div>

			<div style={{ display: "flex", gap: 88 }}>
				<OgStat label="Tokens" value={formatTokens(profile.allTime.tokens)} />
				<OgStat label="API-equivalent" value={formatUsd(profile.allTime.usd)} />
				<OgStat label="Rank" value={`#${profile.rank}`} />
			</div>
		</div>,
		{ ...size, fonts },
	);
}
