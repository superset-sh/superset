import type { IconType } from "react-icons";
import { LuGithub, LuGlobe, LuLinkedin, LuTwitter } from "react-icons/lu";

export interface SocialLinksProps {
	linkedinUrl?: string | null;
	twitterUrl?: string | null;
	githubUrl?: string | null;
	websiteUrl?: string | null;
}

function SocialLink({
	href,
	label,
	icon: Icon,
}: {
	href: string;
	label: string;
	icon: IconType;
}) {
	return (
		<a
			href={href}
			target="_blank"
			rel="noreferrer"
			aria-label={label}
			title={label}
			className="text-muted-foreground hover:text-foreground flex items-center"
		>
			<Icon className="size-3.5" />
		</a>
	);
}

/** Icon links to researched social profiles; renders nothing when empty. */
export function SocialLinks({
	linkedinUrl,
	twitterUrl,
	githubUrl,
	websiteUrl,
}: SocialLinksProps) {
	if (!linkedinUrl && !twitterUrl && !githubUrl && !websiteUrl) return null;
	return (
		<span className="flex items-center gap-2">
			{linkedinUrl && (
				<SocialLink href={linkedinUrl} label="LinkedIn" icon={LuLinkedin} />
			)}
			{twitterUrl && (
				<SocialLink href={twitterUrl} label="Twitter / X" icon={LuTwitter} />
			)}
			{githubUrl && (
				<SocialLink href={githubUrl} label="GitHub" icon={LuGithub} />
			)}
			{websiteUrl && (
				<SocialLink href={websiteUrl} label="Website" icon={LuGlobe} />
			)}
		</span>
	);
}
