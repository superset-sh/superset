import { env } from "renderer/env.renderer";

const LINEAR_IMAGE_HOST = "uploads.linear.app";

export function isLinearImageUrl(src: string): boolean {
	try {
		return new URL(src).host === LINEAR_IMAGE_HOST;
	} catch {
		return false;
	}
}

/** Linear's uploads need the org's Linear token, which only our API holds. */
export function getLinearProxyUrl(linearUrl: string): string {
	const proxyUrl = new URL(`${env.NEXT_PUBLIC_API_URL}/api/proxy/linear-image`);
	proxyUrl.searchParams.set("url", linearUrl);
	return proxyUrl.toString();
}
