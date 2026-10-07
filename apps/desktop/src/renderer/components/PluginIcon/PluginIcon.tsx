import { cn } from "@superset/ui/utils";
import { renderToStaticMarkup } from "react-dom/server";
import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import { LuBookOpen, LuDrama, LuPuzzle } from "react-icons/lu";
import {
	SiGooglecalendar,
	SiGooglechrome,
	SiGoogledocs,
	SiGooglesheets,
	SiLinear,
	SiNotion,
	SiPosthog,
	SiSentry,
	SiSupabase,
	SiVercel,
} from "react-icons/si";
import {
	getPresetIcon,
	usePresetIcon,
} from "renderer/assets/app-icons/preset-icons";
import circlebackIconUrl from "renderer/assets/icons/circleback-icon.png";
import figmaIconUrl from "renderer/assets/icons/figma-icon.svg";
import gmailIconUrl from "renderer/assets/icons/gmail-icon.svg";
import granolaIconUrl from "renderer/assets/icons/granola-icon.svg";
import mondayIconUrl from "renderer/assets/icons/monday-icon.svg";
import neonIconUrl from "renderer/assets/icons/neon-icon.png";
import slackIconUrl from "renderer/assets/icons/slack-icon.svg";
import stripeIconUrl from "renderer/assets/icons/stripe-icon.svg";
import ynabIconUrl from "renderer/assets/icons/ynab-icon.png";
import { SuperhumanIcon } from "./components/SuperhumanIcon";

/**
 * Per-plugin brand icons. Icons stay per-app rather than in the shared
 * catalog (same split as INTEGRATIONS — packages/shared isn't React-aware).
 * Every mark sits at one size inside the same tile, so a logo that ships its
 * own square art reads no larger than a transparent one. Black-mark brands
 * stay on the foreground token so they invert with the theme.
 */
const IMAGE_ICONS: Record<string, string> = {
	figma: figmaIconUrl,
	slack: slackIconUrl,
	neon: neonIconUrl,
	circleback: circlebackIconUrl,
	gmail: gmailIconUrl,
	stripe: stripeIconUrl,
	ynab: ynabIconUrl,
	granola: granolaIconUrl,
	monday: mondayIconUrl,
};

const PLUGIN_ICONS: Record<string, { icon: IconType; color?: string }> = {
	github: { icon: FaGithub },
	superhuman: { icon: SuperhumanIcon },
	notion: { icon: SiNotion },
	sentry: { icon: SiSentry },
	posthog: { icon: SiPosthog },
	linear: { icon: SiLinear },
	supabase: { icon: SiSupabase, color: "#3ECF8E" },
	context7: { icon: LuBookOpen },
	playwright: { icon: LuDrama, color: "#2EAD33" },
	"chrome-devtools": { icon: SiGooglechrome, color: "#4285F4" },
	"google-calendar": { icon: SiGooglecalendar, color: "#4285F4" },
	"google-docs": { icon: SiGoogledocs, color: "#4285F4" },
	"google-sheets": { icon: SiGooglesheets, color: "#0F9D58" },
	vercel: { icon: SiVercel },
};

/**
 * The same artwork PluginIcon shows, as a URL for chips that cannot render a
 * component. Glyph brands are rendered to an inline SVG in the theme's
 * foreground so the chip matches the menu entry.
 */
export function getPluginIconUrl(
	pluginName: string,
	isDark: boolean,
): string | undefined {
	if (pluginName === "superset") return getPresetIcon("superset", isDark);
	const artwork = IMAGE_ICONS[pluginName];
	if (artwork !== undefined) return artwork;
	const entry = PLUGIN_ICONS[pluginName];
	const Icon = entry?.icon ?? LuPuzzle;
	const svg = renderToStaticMarkup(
		<Icon color={entry?.color ?? (isDark ? "#fafafa" : "#18181b")} />,
	);
	return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface PluginIconProps {
	pluginName: string;
	className?: string;
}

export function PluginIcon({ pluginName, className }: PluginIconProps) {
	const supersetIcon = usePresetIcon("superset");
	const size = className ?? "size-9";

	if (pluginName === "superset") {
		return (
			<img
				src={supersetIcon}
				alt=""
				className={cn("shrink-0 rounded-lg object-cover", size)}
			/>
		);
	}

	const imageIcon = IMAGE_ICONS[pluginName];
	const entry = PLUGIN_ICONS[pluginName];
	const Icon = entry?.icon ?? LuPuzzle;
	return (
		<div
			className={cn(
				"@container flex shrink-0 items-center justify-center rounded-lg bg-muted/40 text-foreground",
				size,
			)}
		>
			{imageIcon !== undefined ? (
				<img
					src={imageIcon}
					alt=""
					className="size-3/5 object-contain @max-[1.5rem]:size-5/6"
				/>
			) : (
				<Icon
					className="size-3/5 @max-[1.5rem]:size-5/6"
					style={entry?.color ? { color: entry.color } : undefined}
				/>
			)}
		</div>
	);
}
