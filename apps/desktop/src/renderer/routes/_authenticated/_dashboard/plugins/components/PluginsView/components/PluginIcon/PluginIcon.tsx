import { cn } from "@superset/ui/utils";
import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import {
	LuBookOpen,
	LuDatabase,
	LuDrama,
	LuLayers,
	LuPuzzle,
} from "react-icons/lu";
import {
	SiFigma,
	SiGooglechrome,
	SiLinear,
	SiNotion,
	SiSentry,
	SiStripe,
} from "react-icons/si";

/**
 * Per-plugin brand icons. Icons stay per-app rather than in the shared
 * catalog (same split as INTEGRATIONS — packages/shared isn't React-aware).
 * Brands react-icons doesn't carry fall back to a themed lucide glyph.
 */
const PLUGIN_ICONS: Record<string, IconType> = {
	superset: LuLayers,
	linear: SiLinear,
	github: FaGithub,
	notion: SiNotion,
	sentry: SiSentry,
	figma: SiFigma,
	stripe: SiStripe,
	neon: LuDatabase,
	context7: LuBookOpen,
	playwright: LuDrama,
	"chrome-devtools": SiGooglechrome,
};

interface PluginIconProps {
	pluginName: string;
	className?: string;
}

export function PluginIcon({ pluginName, className }: PluginIconProps) {
	const Icon = PLUGIN_ICONS[pluginName] ?? LuPuzzle;
	return (
		<div
			className={cn(
				"flex shrink-0 items-center justify-center rounded-lg border border-border bg-muted/40 text-foreground",
				className ?? "size-9",
			)}
		>
			<Icon className="size-1/2" />
		</div>
	);
}
