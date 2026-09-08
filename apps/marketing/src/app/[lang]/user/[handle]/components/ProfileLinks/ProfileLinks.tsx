import { useLingui } from "@lingui/react/macro";

interface ProfileLinksProps {
	githubHandle: string | null;
	xHandle: string | null;
	websiteUrl: string | null;
}

function hostname(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

export function ProfileLinks({
	githubHandle,
	xHandle,
	websiteUrl,
}: ProfileLinksProps) {
	const { t } = useLingui();

	if (!githubHandle && !xHandle && !websiteUrl) return null;

	const linkClass =
		"font-mono text-[0.66rem] uppercase tracking-[0.1em] text-muted-foreground hover:text-brand transition-colors";

	return (
		<div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-5">
			{githubHandle && (
				<a
					href={`https://github.com/${githubHandle}`}
					rel="me noopener"
					target="_blank"
					className={linkClass}
					title={t({
						message: "Verified through sign-in",
					})}
				>
					<span className="text-brand mr-1">✓</span>
					{`github.com/${githubHandle}`}
				</a>
			)}
			{xHandle && (
				<a
					href={`https://x.com/${xHandle}`}
					rel="nofollow ugc noopener"
					target="_blank"
					className={linkClass}
				>
					<span className="text-muted-foreground/50 mr-1">↗</span>
					{`x.com/${xHandle}`}
				</a>
			)}
			{websiteUrl && (
				<a
					href={websiteUrl}
					rel="nofollow ugc noopener"
					target="_blank"
					className={linkClass}
				>
					<span className="text-muted-foreground/50 mr-1">↗</span>
					{hostname(websiteUrl)}
				</a>
			)}
		</div>
	);
}
