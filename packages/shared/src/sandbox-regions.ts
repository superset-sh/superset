/** Vercel Sandbox regions, with a location for picking the nearest one. */
export const SANDBOX_REGIONS = [
	{ id: "iad1", city: "Washington, D.C.", lat: 38.9, lng: -77.0 },
	{ id: "sfo1", city: "San Francisco", lat: 37.8, lng: -122.4 },
	{ id: "pdx1", city: "Portland", lat: 45.5, lng: -122.7 },
	{ id: "cle1", city: "Cleveland", lat: 41.5, lng: -81.7 },
	{ id: "yul1", city: "Montreal", lat: 45.5, lng: -73.6 },
	{ id: "gru1", city: "São Paulo", lat: -23.5, lng: -46.6 },
	{ id: "lhr1", city: "London", lat: 51.5, lng: -0.1 },
	{ id: "dub1", city: "Dublin", lat: 53.3, lng: -6.3 },
	{ id: "cdg1", city: "Paris", lat: 48.9, lng: 2.4 },
	{ id: "fra1", city: "Frankfurt", lat: 50.1, lng: 8.7 },
	{ id: "arn1", city: "Stockholm", lat: 59.3, lng: 18.1 },
	{ id: "cpt1", city: "Cape Town", lat: -33.9, lng: 18.4 },
	{ id: "bom1", city: "Mumbai", lat: 19.1, lng: 72.9 },
	{ id: "sin1", city: "Singapore", lat: 1.4, lng: 103.8 },
	{ id: "hkg1", city: "Hong Kong", lat: 22.3, lng: 114.2 },
	{ id: "icn1", city: "Seoul", lat: 37.6, lng: 127.0 },
	{ id: "hnd1", city: "Tokyo", lat: 35.7, lng: 139.7 },
	{ id: "kix1", city: "Osaka", lat: 34.7, lng: 135.5 },
	{ id: "syd1", city: "Sydney", lat: -33.9, lng: 151.2 },
] as const;

export type SandboxRegionId = (typeof SANDBOX_REGIONS)[number]["id"];

export const SANDBOX_REGION_IDS = SANDBOX_REGIONS.map(
	(region) => region.id,
) as [SandboxRegionId, ...SandboxRegionId[]];

export const DEFAULT_SANDBOX_REGION: SandboxRegionId = "sfo1";

export function isSandboxRegionId(value: string): value is SandboxRegionId {
	return (SANDBOX_REGION_IDS as readonly string[]).includes(value);
}

/** The region closest to a point on the globe, by great-circle distance. */
export function nearestSandboxRegion(
	lat: number,
	lng: number,
): SandboxRegionId {
	const rad = Math.PI / 180;
	let best: (typeof SANDBOX_REGIONS)[number] = SANDBOX_REGIONS[0];
	let bestDistance = Number.POSITIVE_INFINITY;
	for (const region of SANDBOX_REGIONS) {
		const dLat = (region.lat - lat) * rad;
		const dLng = (region.lng - lng) * rad;
		const a =
			Math.sin(dLat / 2) ** 2 +
			Math.cos(lat * rad) *
				Math.cos(region.lat * rad) *
				Math.sin(dLng / 2) ** 2;
		const distance = 2 * Math.asin(Math.sqrt(a));
		if (distance < bestDistance) {
			bestDistance = distance;
			best = region;
		}
	}
	return best.id;
}
