import { cn } from "@superset/ui/utils";
import { renderToStaticMarkup } from "react-dom/server";
import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import { LuBookOpen, LuDrama, LuPuzzle } from "react-icons/lu";
import {
	SiGooglechrome,
	SiGoogledocs,
	SiGooglesheets,
	SiStripe,
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
import linearIconUrl from "renderer/assets/icons/linear-icon.svg";
import mondayIconUrl from "renderer/assets/icons/monday-icon.png";
import neonIconUrl from "renderer/assets/icons/neon-icon.png";
import notionIconUrl from "renderer/assets/icons/notion-icon.png";
import posthogIconUrl from "renderer/assets/icons/posthog-icon.png";
import sentryIconUrl from "renderer/assets/icons/sentry-icon.svg";
import slackIconUrl from "renderer/assets/icons/slack-icon.svg";
import supabaseIconUrl from "renderer/assets/icons/supabase-icon.png";
import superhumanIconUrl from "renderer/assets/icons/superhuman-icon.png";
import ynabIconUrl from "renderer/assets/icons/ynab-icon.png";

/**
 * Per-plugin brand icons. Icons stay per-app rather than in the shared
 * catalog (same split as INTEGRATIONS — packages/shared isn't React-aware).
 * Three tiers: full-bleed marks that ship their own square art (Superset,
 * Linear, and white-tile logos), transparent color marks rendered inside a
 * tile, and tinted glyphs for the rest. Black-mark brands (GitHub, Notion,
 * Vercel) stay on the foreground token so they invert with the theme.
 */

/** Own square artwork — rendered edge to edge, no tile behind. */
const FULL_BLEED_ICONS: Record<string, string> = {
	linear: linearIconUrl,
	posthog: posthogIconUrl,
	notion: notionIconUrl,
	supabase: supabaseIconUrl,
	superhuman: superhumanIconUrl,
	granola: granolaIconUrl,
	monday: mondayIconUrl,
	sentry: sentryIconUrl,
};

/** Transparent full-color marks — rendered inside the tile. */
const IMAGE_ICONS: Record<string, string> = {
	figma: figmaIconUrl,
	slack: slackIconUrl,
	neon: neonIconUrl,
	circleback: circlebackIconUrl,
	gmail: gmailIconUrl,
	ynab: ynabIconUrl,
};

const PLUGIN_ICONS: Record<
	string,
	{ icon: IconType; color?: string; scale?: string }
> = {
	github: { icon: FaGithub },
	stripe: { icon: SiStripe, color: "#635BFF" },
	context7: { icon: LuBookOpen },
	playwright: { icon: LuDrama, color: "#2EAD33" },
	"chrome-devtools": { icon: SiGooglechrome, color: "#4285F4" },
	"google-docs": { icon: SiGoogledocs, color: "#4285F4" },
	"google-sheets": { icon: SiGooglesheets, color: "#0F9D58" },
	vercel: { icon: SiVercel, scale: "size-1/2" },
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
	const artwork = FULL_BLEED_ICONS[pluginName] ?? IMAGE_ICONS[pluginName];
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

	const fullBleed =
		pluginName === "superset" ? supersetIcon : FULL_BLEED_ICONS[pluginName];
	if (fullBleed !== undefined) {
		return (
			<img
				src={fullBleed}
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
				"flex shrink-0 items-center justify-center rounded-lg bg-muted/40 text-foreground",
				size,
			)}
		>
			{imageIcon !== undefined ? (
				<img src={imageIcon} alt="" className="size-3/5 object-contain" />
			) : (
				<Icon
					className={entry?.scale ?? "size-2/3"}
					style={entry?.color ? { color: entry.color } : undefined}
				/>
			)}
		</div>
	);
}
