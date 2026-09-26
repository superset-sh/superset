import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";

export interface BrandAsset {
	src: string;
	fileName: string;
	format: "PNG" | "SVG";
	dimensions?: string;
	label: MessageDescriptor;
	previewClassName: string;
}

export const LOGO_ASSETS: BrandAsset[] = [
	{
		src: "/title.svg",
		fileName: "superset-logo-light.svg",
		format: "SVG",
		label: msg({ message: "Logo, light" }),
		previewClassName: "bg-black p-6",
	},
	{
		src: "/media/superset-symbol.svg",
		fileName: "superset-symbol-light.svg",
		format: "SVG",
		label: msg({ message: "Symbol, light" }),
		previewClassName: "bg-black p-10",
	},
	{
		src: "/media/superset-app-icon.png",
		fileName: "superset-app-icon.png",
		format: "PNG",
		dimensions: "1024 × 1024",
		label: msg({ message: "App icon" }),
		previewClassName: "bg-muted p-6",
	},
	{
		src: "/assets/emails/logo-full.png",
		fileName: "superset-wordmark-black.png",
		format: "PNG",
		dimensions: "512 × 83",
		label: msg({ message: "Wordmark, black" }),
		previewClassName: "bg-white p-8",
	},
	{
		src: "/assets/emails/logo-full-white.png",
		fileName: "superset-wordmark-white.png",
		format: "PNG",
		dimensions: "512 × 83",
		label: msg({ message: "Wordmark, white" }),
		previewClassName: "bg-black p-8",
	},
];

export const PRODUCT_IMAGE_ASSETS: BrandAsset[] = [
	{
		src: "/og-image.png",
		fileName: "superset-desktop.png",
		format: "PNG",
		dimensions: "2400 × 1260",
		label: msg({ message: "Superset desktop app" }),
		previewClassName: "",
	},
	{
		src: "/images/blog/superset-mobile/hero.png",
		fileName: "superset-mobile-terminal.png",
		format: "PNG",
		dimensions: "1600 × 1000",
		label: msg({ message: "Superset Mobile terminal on iPhone" }),
		previewClassName: "",
	},
	{
		src: "/images/blog/superset-mobile/diffs.png",
		fileName: "superset-mobile-diff.png",
		format: "PNG",
		dimensions: "1600 × 1000",
		label: msg({ message: "Superset Mobile code diff on iPhone" }),
		previewClassName: "",
	},
];
