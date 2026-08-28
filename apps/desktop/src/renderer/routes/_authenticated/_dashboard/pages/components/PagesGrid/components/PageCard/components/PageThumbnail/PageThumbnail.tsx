import { Spinner } from "@superset/ui/spinner";
import { useQuery } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import {
	FRAME_HEIGHT,
	FRAME_WIDTH,
	THUMBNAIL_ASPECT_RATIO,
} from "../../../../constants";
import {
	loadThumbnailUrl,
	thumbnailCacheKey,
} from "./utils/pageThumbnailCache";

interface PageThumbnailProps {
	slug: string;
	pageId: string;
}

export function PageThumbnail({ slug, pageId }: PageThumbnailProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [isVisible, setIsVisible] = useState(false);
	const [scale, setScale] = useState(0);

	useEffect(() => {
		const element = containerRef.current;
		if (!element) return;

		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry?.isIntersecting) setIsVisible(true);
			},
			{ rootMargin: "300px" },
		);
		observer.observe(element);

		const resize = new ResizeObserver(([entry]) => {
			const width = entry?.contentRect.width ?? 0;
			if (width > 0) setScale(width / FRAME_WIDTH);
		});
		resize.observe(element);

		return () => {
			observer.disconnect();
			resize.disconnect();
		};
	}, []);

	const pull = cloudTrpc.page.pull.useQuery(
		{ id: pageId },
		{ enabled: isVisible, staleTime: 5 * 60 * 1000 },
	);

	const downloadUrl = pull.data?.downloadUrl;
	const version = pull.data?.version ?? 0;

	const thumbnailEnabled = Boolean(downloadUrl) && version > 0;

	const thumbnail = useQuery({
		queryKey: ["page-thumbnail", pageId, version],
		enabled: thumbnailEnabled,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: () =>
			loadThumbnailUrl(thumbnailCacheKey(pageId, version), async () => {
				const response = await fetch(downloadUrl as string, {
					cache: "force-cache",
				});
				if (!response.ok) {
					throw new Error(`Preview failed to load (${response.status})`);
				}
				return response.text();
			}),
	});

	const isLoading =
		isVisible && (pull.isPending || (thumbnailEnabled && thumbnail.isPending));

	return (
		<div
			ref={containerRef}
			className="relative w-full overflow-hidden bg-muted/40"
			style={{ aspectRatio: THUMBNAIL_ASPECT_RATIO }}
		>
			{thumbnail.data && scale > 0 ? (
				<iframe
					src={thumbnail.data}
					title={slug}
					sandbox="allow-scripts"
					tabIndex={-1}
					aria-hidden="true"
					className="pointer-events-none absolute top-0 left-0 origin-top-left border-0"
					style={{
						width: FRAME_WIDTH,
						height: FRAME_HEIGHT,
						transform: `scale(${scale})`,
					}}
				/>
			) : (
				<div className="flex h-full w-full items-center justify-center text-muted-foreground">
					{isLoading ? (
						<Spinner className="size-4" />
					) : (
						<FileText className="size-5 opacity-40" />
					)}
				</div>
			)}
		</div>
	);
}
