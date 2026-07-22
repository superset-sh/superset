import { POSTHOG_COOKIE_NAME } from "@superset/shared/constants";
import type { PostHogConfig } from "posthog-js";

export const HERO_POSITIONING_FLAG = "landing-hero-positioning";

// Must mirror the PostHog flag config for landing-hero-positioning (variant
// order and rollout split) and PostHog's cross-SDK assignment hash. Drift is
// safe but reintroduces the swap-on-/flags-response this bootstrap removes.
const VARIANTS = [
	{ key: "control", rolloutPercentage: 50 },
	{ key: "capability-mac", rolloutPercentage: 50 },
];

const LONG_SCALE = 2 ** 60 - 1;

function sha1Hex(input: string): string {
	const bytes = new TextEncoder().encode(input);
	const paddedLength = (((bytes.length + 8) >> 6) + 1) << 6;
	const padded = new Uint8Array(paddedLength);
	padded.set(bytes);
	padded[bytes.length] = 0x80;
	const view = new DataView(padded.buffer);
	const bitLength = bytes.length * 8;
	view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
	view.setUint32(paddedLength - 4, bitLength >>> 0);

	let h0 = 0x67452301;
	let h1 = 0xefcdab89;
	let h2 = 0x98badcfe;
	let h3 = 0x10325476;
	let h4 = 0xc3d2e1f0;
	const w = new Uint32Array(80);

	for (let block = 0; block < paddedLength; block += 64) {
		for (let i = 0; i < 16; i++) {
			w[i] = view.getUint32(block + i * 4);
		}
		for (let i = 16; i < 80; i++) {
			const n =
				(w[i - 3] ?? 0) ^ (w[i - 8] ?? 0) ^ (w[i - 14] ?? 0) ^ (w[i - 16] ?? 0);
			w[i] = ((n << 1) | (n >>> 31)) >>> 0;
		}

		let a = h0;
		let b = h1;
		let c = h2;
		let d = h3;
		let e = h4;

		for (let i = 0; i < 80; i++) {
			let f: number;
			let k: number;
			if (i < 20) {
				f = (b & c) | (~b & d);
				k = 0x5a827999;
			} else if (i < 40) {
				f = b ^ c ^ d;
				k = 0x6ed9eba1;
			} else if (i < 60) {
				f = (b & c) | (b & d) | (c & d);
				k = 0x8f1bbcdc;
			} else {
				f = b ^ c ^ d;
				k = 0xca62c1d6;
			}
			const temp =
				((((a << 5) | (a >>> 27)) >>> 0) + f + e + k + (w[i] ?? 0)) >>> 0;
			e = d;
			d = c;
			c = ((b << 30) | (b >>> 2)) >>> 0;
			b = a;
			a = temp;
		}

		h0 = (h0 + a) >>> 0;
		h1 = (h1 + b) >>> 0;
		h2 = (h2 + c) >>> 0;
		h3 = (h3 + d) >>> 0;
		h4 = (h4 + e) >>> 0;
	}

	return [h0, h1, h2, h3, h4]
		.map((word) => word.toString(16).padStart(8, "0"))
		.join("");
}

function variantForDistinctId(distinctId: string): string {
	const hashValue =
		Number.parseInt(
			sha1Hex(`${HERO_POSITIONING_FLAG}.${distinctId}variant`).slice(0, 15),
			16,
		) / LONG_SCALE;
	let cumulative = 0;
	for (const variant of VARIANTS) {
		cumulative += variant.rolloutPercentage / 100;
		if (hashValue < cumulative) return variant.key;
	}
	return VARIANTS[VARIANTS.length - 1]?.key ?? "control";
}

function distinctIdFromCookie(): string | undefined {
	const match = document.cookie
		.split("; ")
		.find((row) => row.startsWith(`${POSTHOG_COOKIE_NAME}=`));
	if (!match) return undefined;
	try {
		const parsed = JSON.parse(
			decodeURIComponent(match.slice(POSTHOG_COOKIE_NAME.length + 1)),
		);
		return typeof parsed.distinct_id === "string"
			? parsed.distinct_id
			: undefined;
	} catch {
		return undefined;
	}
}

export function getHeroFlagBootstrap(): NonNullable<
	PostHogConfig["bootstrap"]
> {
	const distinctId = distinctIdFromCookie() ?? crypto.randomUUID();
	return {
		distinctID: distinctId,
		isIdentifiedID: false,
		featureFlags: {
			[HERO_POSITIONING_FLAG]: variantForDistinctId(distinctId),
		},
	};
}
