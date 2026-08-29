import { Spinner } from "@superset/ui/spinner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cloudTrpc } from "renderer/lib/cloud-trpc";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { THUMBNAIL_ASPECT_RATIO } from "../../../../constants";

interface PageThumbnailProps {
	pageId: string;
	version: number | null;
	accountId: string | undefined;
}

export function PageThumbnail({
	pageId,
	version,
	accountId,
}: PageThumbnailProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const recovered = useRef(false);
	const queryClient = useQueryClient();
	const [isVisible, setIsVisible] = useState(false);

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

		return () => observer.disconnect();
	}, []);

	const versionKey = version === null ? null : String(version);
	const enabled = isVisible && versionKey !== null && accountId !== undefined;
	const key =
		enabled && versionKey
			? { accountId: accountId as string, pageId, version: versionKey }
			: null;

	const cached = useQuery({
		queryKey: ["page-thumbnail", "cached", accountId, pageId, versionKey],
		enabled,
		staleTime: Number.POSITIVE_INFINITY,
		queryFn: () =>
			electronTrpcClient.page.thumbnail.peek.query(
				key as NonNullable<typeof key>,
			),
	});

	const needsCapture = enabled && cached.isSuccess && cached.data === null;

	const pull = cloudTrpc.page.pull.useQuery(
		{ id: pageId, version: version ?? undefined },
		{ enabled: needsCapture, staleTime: 5 * 60 * 1000 },
	);

	const downloadUrl = pull.data?.downloadUrl;

	const captured = useQuery({
		queryKey: ["page-thumbnail", "captured", accountId, pageId, versionKey],
		enabled: needsCapture && Boolean(downloadUrl),
		staleTime: Number.POSITIVE_INFINITY,
		retry: false,
		queryFn: async () => {
			const response = await fetch(downloadUrl as string, {
				cache: "force-cache",
			});
			if (!response.ok) {
				throw new Error(`Preview failed to load (${response.status})`);
			}
			return electronTrpcClient.page.thumbnail.ensure.mutate({
				...(key as NonNullable<typeof key>),
				html: await response.text(),
			});
		},
	});

	const recoverFromEviction = () => {
		if (recovered.current) return;
		recovered.current = true;
		for (const stage of ["cached", "captured"]) {
			queryClient.removeQueries({
				queryKey: ["page-thumbnail", stage, accountId, pageId, versionKey],
			});
		}
	};

	const src = cached.data ?? captured.data ?? null;
	const failed = cached.isError || pull.isError || captured.isError;
	const isLoading =
		enabled && !src && !failed && (cached.isPending || needsCapture);

	return (
		<div
			ref={containerRef}
			className="relative w-full overflow-hidden bg-muted/40"
			style={{ aspectRatio: THUMBNAIL_ASPECT_RATIO }}
		>
			{src ? (
				<img
					src={src}
					alt=""
					aria-hidden="true"
					loading="lazy"
					decoding="async"
					onError={recoverFromEviction}
					className="absolute inset-0 h-full w-full object-cover object-top"
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
