import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import { getBlogPost } from "@/lib/blog";
import { formatBlogDate } from "@/lib/blog-utils";

export const alt = "Superset Blog";
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

function getAvatarDataUri(avatarPath: string): string | null {
	const ext = path.extname(avatarPath).slice(1).toLowerCase();
	const mime =
		ext === "jpg"
			? "image/jpeg"
			: ext === "webp"
				? "image/webp"
				: `image/${ext}`;
	return readFileAsDataUri({ filePath: avatarPath, mime });
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
	const post = getBlogPost(slug);
	const fontData = await interBold;
	const logoDataUri = readFileAsDataUri({
		filePath: "title.svg",
		mime: "image/svg+xml",
	});

	if (!post) {
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
				Superset Blog
			</div>,
			{
				...size,
				fonts: [
					{ name: "Inter", data: fontData, weight: 700, style: "normal" },
				],
			},
		);
	}

	const { author } = post;
	const avatarDataUri = author.avatar ? getAvatarDataUri(author.avatar) : null;
	const initials = author.name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);

	return new ImageResponse(
		<div
			style={{
				background: "#0a0a0a",
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
				justifyContent: "space-between",
				padding: "48px 64px",
				fontFamily: "Inter",
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
						maxWidth: "75%",
					}}
				>
					{post.title}
				</div>
				<div style={{ fontSize: 24, color: "#666666" }}>
					{formatBlogDate(post.date)}
				</div>
			</div>

			{/* Bottom section: author left, logo right */}
			<div
				style={{
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
				}}
			>
				{/* Author info */}
				<div style={{ display: "flex", alignItems: "center", gap: 20 }}>
					{avatarDataUri ? (
						// biome-ignore lint/a11y/useAltText: ImageResponse requires native <img>
						// biome-ignore lint/performance/noImgElement: ImageResponse requires native <img>
						<img
							src={avatarDataUri}
							width={95}
							height={95}
							style={{
								borderRadius: "50%",
								objectFit: "cover",
								filter: "grayscale(1)",
							}}
						/>
					) : (
						<div
							style={{
								width: 112,
								height: 112,
								borderRadius: "50%",
								background: "rgba(255, 255, 255, 0.1)",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								fontSize: 40,
								fontWeight: 600,
								color: "#ffffff",
							}}
						>
							{initials}
						</div>
					)}
					<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						<div
							style={{
								fontSize: 32,
								fontWeight: 600,
								color: "#ffffff",
							}}
						>
							{author.name}
						</div>
						{author.role && (
							<div
								style={{
									fontSize: 24,
									color: "#888888",
								}}
							>
								{author.role}
							</div>
						)}
					</div>
				</div>

				{/* Superset logo */}
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
		</div>,
		{
			...size,
			fonts: [{ name: "Inter", data: fontData, weight: 700, style: "normal" }],
		},
	);
}
