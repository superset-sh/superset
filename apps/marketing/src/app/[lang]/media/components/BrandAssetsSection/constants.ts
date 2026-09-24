import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface BrandAsset {
	src: string;
	fileName: string;
	dimensions: string;
	label: MessageDescriptor;
	previewClassName: string;
}

export const LOGO_ASSETS: BrandAsset[] = [
	{
		src: "/assets/emails/logo-full.png",
		fileName: "superset-wordmark-black.png",
		dimensions: "512 × 83",
		label: msg({ message: "Wordmark, black" }),
		previewClassName: "bg-white p-8",
	},
	{
		src: "/assets/emails/logo-full-white.png",
		fileName: "superset-wordmark-white.png",
		dimensions: "512 × 83",
		label: msg({ message: "Wordmark, white" }),
		previewClassName: "bg-black p-8",
	},
	{
		src: "/assets/emails/logo.png",
		fileName: "superset-app-icon.png",
		dimensions: "240 × 240",
		label: msg({ message: "App icon" }),
		previewClassName: "bg-muted p-6",
	},
];

export const PRODUCT_IMAGE_ASSETS: BrandAsset[] = [
	{
		src: "/images/blog/superset-mobile/hero.png",
		fileName: "superset-mobile-terminal.png",
		dimensions: "1600 × 1000",
		label: msg({ message: "Superset Mobile terminal on iPhone" }),
		previewClassName: "",
	},
	{
		src: "/images/blog/superset-mobile/diffs.png",
		fileName: "superset-mobile-diff.png",
		dimensions: "1600 × 1000",
		label: msg({ message: "Superset Mobile code diff on iPhone" }),
		previewClassName: "",
	},
];
