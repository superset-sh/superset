import { GlobeIcon } from "lucide-react";
import { useState } from "react";

export function BrowserTabFavicon({ src }: { src: string | null }) {
	const [failed, setFailed] = useState(false);
	// Chromium guesses /favicon.ico for pages that declare none, so the URL can
	// 404 — fall back to a globe instead of a broken image.
	if (!src || failed) {
		return <GlobeIcon className="size-3.5 shrink-0 text-muted-foreground" />;
	}
	return (
		<img
			src={src}
			alt=""
			className="size-3.5 shrink-0"
			onError={() => setFailed(true)}
		/>
	);
}
