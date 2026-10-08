import type { IconType } from "react-icons";
import { FaGithub } from "react-icons/fa";
import {
	SiGooglecalendar,
	SiLinear,
	SiNotion,
	SiPosthog,
	SiSentry,
	SiVercel,
} from "react-icons/si";
import { SuperhumanIcon } from "./components/SuperhumanIcon";

export const IMAGE_ICONS: Record<string, string> = {
	circleback: "/plugins/circleback-icon.png",
	gmail: "/plugins/gmail-icon.svg",
	granola: "/plugins/granola-icon.svg",
	neon: "/plugins/neon-icon.png",
	slack: "/plugins/slack-icon.svg",
	stripe: "/plugins/stripe-icon.svg",
	ynab: "/plugins/ynab-icon.png",
};

export const GLYPH_ICONS: Record<string, { icon: IconType; color?: string }> = {
	github: { icon: FaGithub },
	linear: { icon: SiLinear },
	notion: { icon: SiNotion },
	posthog: { icon: SiPosthog },
	sentry: { icon: SiSentry },
	superhuman: { icon: SuperhumanIcon },
	vercel: { icon: SiVercel },
	"google-calendar": { icon: SiGooglecalendar, color: "#4285F4" },
};
