import { Trans, useLingui } from "@lingui/react/macro";
import { useState } from "react";
import { LuImageOff } from "react-icons/lu";
import { useMarkdownResources } from "renderer/components/MarkdownRenderer/providers/MarkdownResourceProvider";
import { useLocalImageUrl } from "./hooks/useLocalImageUrl";
import { resolveLocalImagePath } from "./utils/resolveLocalImagePath";

/**
 * Sources an <img> may load as-is: embedded data URLs and web URLs.
 * Cleartext http only for markdown on disk — from a PR comment it would let
 * a stranger make this app GET localhost or LAN services, which https can't
 * reach; for your own files it's a dev server's screenshot.
 *
 * Every other source — relative, absolute, file: — names a file, which
 * only means something when the markdown itself is a file on disk. Those
 * go through the workspace filesystem (see MarkdownResourceProvider), never
 * the DOM: a relative URL here would resolve against the renderer's own
 * document, and a cloud workspace's files aren't on this machine at all.
 */
function loadsDirectly(src: string, fromDisk: boolean): boolean {
	const lower = src.trim().toLowerCase();
	return (
		lower.startsWith("data:") ||
		lower.startsWith("https://") ||
		(fromDisk && lower.startsWith("http://"))
	);
}

interface SafeImageProps {
	src?: string;
	alt?: string;
	className?: string;
}

export function SafeImage({ src, alt, className }: SafeImageProps) {
	const { t } = useLingui();
	const resources = useMarkdownResources();
	const localPath =
		resources && src ? resolveLocalImagePath(src, resources) : null;
	const local = useLocalImageUrl(
		localPath,
		resources?.readFile,
		resources?.revision,
	);
	// Bytes that arrived but aren't an image (an HTML file named .png, a
	// text file, an empty file) would otherwise sit there as a broken icon.
	const [undecodableUrl, setUndecodableUrl] = useState<string | null>(null);
	const imageClassName = className ?? "max-w-full h-auto rounded-md my-4";

	if (localPath !== null) {
		if (local.status === "loading") return null;
		if (local.status === "ready" && local.url !== undecodableUrl) {
			return (
				<img
					src={local.url}
					alt={alt}
					className={imageClassName}
					onError={() => setUndecodableUrl(local.url)}
				/>
			);
		}
	} else if (src && loadsDirectly(src, resources !== null)) {
		return <img src={src} alt={alt} className={imageClassName} />;
	}

	const failedToLoad = localPath !== null;
	return (
		<div
			className={`inline-flex items-center gap-2 px-3 py-2 rounded-md bg-muted text-muted-foreground text-sm ${className ?? ""}`}
			title={
				failedToLoad
					? localPath
					: t({ message: `Image blocked: ${src ?? "(empty)"}` })
			}
		>
			<LuImageOff className="w-4 h-4 flex-shrink-0" />
			<span className="truncate max-w-[300px]">
				{failedToLoad ? (
					<Trans>Could not load image</Trans>
				) : (
					<Trans>Image blocked</Trans>
				)}
			</span>
		</div>
	);
}
