import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getChangelogEntry } from "@/lib/changelog";
import { formatChangelogDate } from "@/lib/changelog-utils";

export const alt = "Superset Changelog";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function readFileAsDataUri({
	filePath,
	mime,
}: {
	filePath: string;
	mime: string;
}): string | null {
	try {
		const absolutePath = path.join(process.cwd(), "public", filePath);
		const buffer = fs.readFileSync(absolutePath);
		return `data:${mime};base64,${buffer.toString("base64")}`;
	} catch {
		return null;
	}
}

const interBold = fetch(
	"https://fonts.gstatic.com/s/inter/v18/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuFuYMZhrib2Bg-4.ttf",
).then((res) => res.arrayBuffer());

export default async function Image({
	params,
}: {
	params: Promise<{ slug: string }>;
}) {
	const { slug } = await params;
	const entry = getChangelogEntry(slug);
	const fontData = await interBold;
	const logoDataUri = readFileAsDataUri({
		filePath: "title.svg",
		mime: "image/svg+xml",
	});

	if (!entry) {
		return new ImageResponse(
			<div
				style={{
					background: "#0a0a0a",
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
				Superset Changelog
			</div>,
			{
				...size,
				fonts: [
					{ name: "Inter", data: fontData, weight: 700, style: "normal" },
				],
			},
		);
	}

	const coverImageUri = entry.image
		? readFileAsDataUri({
				filePath: entry.image,
				mime: "image/png",
			})
		: null;

	return new ImageResponse(
		<div
			style={{
				background: "#0a0a0a",
				width: "100%",
				height: "100%",
				display: "flex",
				position: "relative",
				fontFamily: "Inter",
			}}
		>
			{/* Background cover image */}
			{coverImageUri && (
				// biome-ignore lint/a11y/useAltText: ImageResponse requires native <img>
				// biome-ignore lint/performance/noImgElement: ImageResponse requires native <img>
				<img
					src={coverImageUri}
					style={{
						position: "absolute",
						top: 0,
						left: 0,
						width: "100%",
						height: "100%",
						objectFit: "cover",
						opacity: 0.7,
					}}
				/>
			)}

			{/* Dark gradient overlay for text legibility */}
			<div
				style={{
					position: "absolute",
					top: 0,
					left: 0,
					width: "100%",
					height: "100%",
					background:
						"linear-gradient(to bottom, rgba(10,10,10,0.65) 0%, rgba(10,10,10,0.25) 50%, rgba(10,10,10,0.7) 100%)",
				}}
			/>

			{/* Content */}
			<div
				style={{
					position: "relative",
					width: "100%",
					height: "100%",
					display: "flex",
					flexDirection: "column",
					justifyContent: "space-between",
					padding: "48px 64px",
				}}
			>
				{/* Title + date */}
				<div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
					<div
						style={{
							fontSize: 56,
							fontWeight: 700,
							color: "#ffffff",
							lineHeight: 1.2,
							maxWidth: "90%",
						}}
					>
						{entry.title}
					</div>
					<div style={{ fontSize: 24, color: "#999999" }}>
						{formatChangelogDate(entry.date)}
					</div>
				</div>

				{/* Bottom: logo left-aligned */}
				<div
					style={{
						display: "flex",
						justifyContent: "flex-start",
						alignItems: "center",
					}}
				>
					{logoDataUri ? (
						// biome-ignore lint/a11y/useAltText: ImageResponse requires native <img>
						// biome-ignore lint/performance/noImgElement: ImageResponse requires native <img>
						<img src={logoDataUri} height={120} />
					) : (
						<div
							style={{
								fontSize: 48,
								fontWeight: 700,
								color: "#ffffff",
							}}
						>
							Superset
						</div>
					)}
				</div>
			</div>
		</div>,
		{
			...size,
			fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }],
		},
	);
}
