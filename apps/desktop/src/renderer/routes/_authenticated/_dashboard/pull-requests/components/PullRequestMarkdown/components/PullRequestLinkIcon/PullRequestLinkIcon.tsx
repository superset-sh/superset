import { cn } from "@superset/ui/utils";
import { Globe } from "lucide-react";
import { useState } from "react";
import { FaGithub } from "react-icons/fa";

const ICON_CLASS_NAME =
	"mr-1 inline-block size-[1em] shrink-0 -translate-y-px align-middle";

function parseHttpUrl(url: string): URL | null {
	try {
		const parsed = new URL(url);
		return parsed.protocol === "https:" || parsed.protocol === "http:"
			? parsed
			: null;
	} catch {
		return null;
	}
}

interface PullRequestLinkIconProps {
	url: string;
	className?: string;
}

/**
 * The site a link points at: GitHub's mark for GitHub, else the favicon
 * served by the link's own origin. No lookup service sees the hostname.
 */
export function PullRequestLinkIcon({
	url,
	className,
}: PullRequestLinkIconProps) {
	const parsed = parseHttpUrl(url);
	const host = parsed?.hostname.toLowerCase();
	const [failed, setFailed] = useState(false);
	if (host === "github.com" || host?.endsWith(".github.com")) {
		return <FaGithub aria-hidden className={cn(ICON_CLASS_NAME, className)} />;
	}
	if (!parsed || failed) {
		return (
			<Globe
				aria-hidden
				strokeWidth={1.75}
				className={cn(ICON_CLASS_NAME, "opacity-70", className)}
			/>
		);
	}
	return (
		<img
			src={`${parsed.origin}/favicon.ico`}
			alt=""
			aria-hidden
			loading="lazy"
			decoding="async"
			draggable={false}
			onError={() => setFailed(true)}
			className={cn(ICON_CLASS_NAME, "rounded-[2px] object-contain", className)}
		/>
	);
}
