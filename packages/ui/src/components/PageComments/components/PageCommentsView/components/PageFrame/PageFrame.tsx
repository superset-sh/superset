import { type Ref, useState } from "react";
import { cn } from "../../../../../../lib/utils";
import { Spinner } from "../../../../../ui/spinner";

interface PageFrameProps {
	src: string;
	title: string;
	ref?: Ref<HTMLIFrameElement>;
	onLoad?: () => void;
}

/**
 * The page is served from its own origin, so `allow-same-origin` gives it a
 * real origin of its own (storage, cookies scoped to that one page) without
 * ever being ours. The omissions are the policy: no top navigation, no
 * downloads, and popups stay sandboxed.
 */
export function PageFrame({ src, title, ref, onLoad }: PageFrameProps) {
	const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
	const loaded = loadedSrc === src;

	return (
		<div className="relative h-full w-full bg-background">
			<iframe
				ref={ref}
				onLoad={() => {
					setLoadedSrc(src);
					onLoad?.();
				}}
				title={title}
				src={src}
				sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
				referrerPolicy="no-referrer"
				allow="fullscreen"
				className={cn(
					"h-full w-full border-0 bg-background",
					loaded ? "opacity-100" : "opacity-0",
				)}
			/>

			{loaded ? null : (
				<div className="pointer-events-none absolute inset-0 flex items-center justify-center">
					<Spinner className="size-4 text-muted-foreground" />
				</div>
			)}
		</div>
	);
}
