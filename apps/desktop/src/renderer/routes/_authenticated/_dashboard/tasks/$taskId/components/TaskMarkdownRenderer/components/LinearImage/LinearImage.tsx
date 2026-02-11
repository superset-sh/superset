import { env } from "renderer/env.renderer";

const LINEAR_IMAGE_HOST = "uploads.linear.app";

/**
 * Checks if a URL is a Linear image upload URL.
 */
function isLinearImageUrl(src: string): boolean {
	try {
		const url = new URL(src);
		return url.host === LINEAR_IMAGE_HOST;
	} catch {
		return false;
	}
}

/**
 * Converts a Linear image URL to our proxy URL.
 */
function getLinearProxyUrl(linearUrl: string): string {
	const proxyUrl = new URL(`${env.NEXT_PUBLIC_API_URL}/api/proxy/linear-image`);
	proxyUrl.searchParams.set("url", linearUrl);
	return proxyUrl.toString();
}

interface LinearImageProps {
	src?: string;
	alt?: string;
	title?: string;
}

/**
 * Image component that proxies Linear URLs through our authenticated API.
 * Non-Linear URLs are passed through unchanged.
 */
export function LinearImage({ src, alt, title }: LinearImageProps) {
	if (!src) {
		return null;
	}

	const proxiedSrc = isLinearImageUrl(src) ? getLinearProxyUrl(src) : src;

	return (
		<img
			src={proxiedSrc}
			alt={alt}
			title={title}
			className="max-w-full h-auto rounded-md my-4"
			crossOrigin={isLinearImageUrl(src) ? "use-credentials" : undefined}
		/>
	);
}
