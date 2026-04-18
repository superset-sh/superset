"use client";

import { useEffect, useRef } from "react";

const W = 96;
const H = 72;

const BAYER_8 = [
	[0, 32, 8, 40, 2, 34, 10, 42],
	[48, 16, 56, 24, 50, 18, 58, 26],
	[12, 44, 4, 36, 14, 46, 6, 38],
	[60, 28, 52, 20, 62, 30, 54, 22],
	[3, 35, 11, 43, 1, 33, 9, 41],
	[51, 19, 59, 27, 49, 17, 57, 25],
	[15, 47, 7, 39, 13, 45, 5, 37],
	[63, 31, 55, 23, 61, 29, 53, 21],
];

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb {
	const s = hex.replace("#", "");
	return [
		Number.parseInt(s.slice(0, 2), 16),
		Number.parseInt(s.slice(2, 4), 16),
		Number.parseInt(s.slice(4, 6), 16),
	];
}

function luminance([r, g, b]: Rgb): number {
	return 0.299 * r + 0.587 * g + 0.114 * b;
}

function hashStr(s: string): number {
	let h = 2166136261;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

interface DitheredBackgroundProps {
	colors: readonly [string, string, string, string];
	className?: string;
}

export function DitheredBackground({
	colors,
	className = "",
}: DitheredBackgroundProps) {
	const ref = useRef<HTMLCanvasElement>(null);

	useEffect(() => {
		const canvas = ref.current;
		if (!canvas) return;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const palette: Rgb[] = colors
			.map(parseHex)
			.sort((a, b) => luminance(a) - luminance(b));
		const n = palette.length - 1;

		// Per-card variation so each card looks distinct
		const seed = hashStr(colors.join("|"));
		const angle = ((seed % 360) * Math.PI) / 180;
		const dx = Math.cos(angle);
		const dy = Math.sin(angle);
		const phase = ((seed >>> 8) % 1000) / 100;

		const img = ctx.createImageData(W, H);

		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				const nx = x / W - 0.5;
				const ny = y / H - 0.5;

				// Gentle directional ramp + low-freq wobble for variety
				let v = 0.5 + (nx * dx + ny * dy) * 0.45;
				v += Math.sin(nx * 6 + ny * 4 + phase) * 0.07;
				v += Math.sin(nx * 11 - ny * 9 + phase * 2) * 0.04;
				v = Math.max(0, Math.min(1, v));

				// Ordered dither across the full palette (4 levels)
				const t = (BAYER_8[y % 8]?.[x % 8] ?? 0) / 64;
				const level = Math.max(0, Math.min(n, Math.floor(v * n + t)));
				const pick = palette[level] ?? palette[0]!;

				const i = (y * W + x) * 4;
				img.data[i] = pick[0];
				img.data[i + 1] = pick[1];
				img.data[i + 2] = pick[2];
				img.data[i + 3] = 255;
			}
		}
		ctx.putImageData(img, 0, 0);
	}, [colors]);

	return (
		<canvas
			ref={ref}
			width={W}
			height={H}
			className={className}
			style={{ imageRendering: "pixelated" }}
			aria-hidden="true"
		/>
	);
}
