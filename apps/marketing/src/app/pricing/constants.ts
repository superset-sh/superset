import { DOWNLOAD_URL_MAC_ARM64 } from "@superset/shared/constants";
import type { FAQItem } from "@/app/components/FAQSection";

export type TierId = "free" | "pro" | "enterprise";

export interface PricingTier {
	id: TierId;
	name: string;
	description: string;
	price:
		| { kind: "fixed"; display: string; note: string }
		| {
				kind: "variable";
				monthly: { display: string; note: string; cadence: string };
				yearly: { display: string; note: string; cadence: string };
		  }
		| { kind: "custom"; display: string; note: string };
	features: string[];
	featureLimits?: Partial<Record<string, string>>;
	cta: {
		label: string;
		href: string;
		variant: "default" | "outline" | "secondary";
		external?: boolean;
	};
	highlight?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
	{
		id: "free",
		name: "Free",
		description: "For individuals getting started",
		price: { kind: "fixed", display: "$0", note: "Free for everyone" },
		features: [
			"1 user",
			"Local workspaces",
			"Desktop app",
			"GitHub integration",
			"CLI (coming soon)",
		],
		cta: {
			label: "Download app",
			href: DOWNLOAD_URL_MAC_ARM64,
			variant: "outline",
			external: true,
		},
	},
	{
		id: "pro",
		name: "Pro",
		description: "For teams that need more power",
		price: {
			kind: "variable",
			monthly: {
				display: "$20",
				note: "per user/month",
				cadence: "Billed monthly",
			},
			yearly: {
				display: "$15",
				note: "per user/month",
				cadence: "Billed yearly",
			},
		},
		features: [
			"Everything in Free",
			"Unlimited users",
			"Remote workspaces",
			"Linear integration",
			"Mobile (coming soon)",
		],
		cta: {
			label: "Download app",
			href: DOWNLOAD_URL_MAC_ARM64,
			variant: "default",
			external: true,
		},
		highlight: true,
	},
	{
		id: "enterprise",
		name: "Enterprise",
		description: "For organizations with advanced needs",
		price: {
			kind: "custom",
			display: "Custom pricing",
			note: "Billed yearly",
		},
		features: [
			"Everything in Pro",
			"SSO & advanced security",
			"Audit logs",
			"SLA & dedicated support",
			"Custom integrations",
		],
		cta: {
			label: "Contact sales",
			href: "/enterprise",
			variant: "outline",
		},
	},
];

export interface ComparisonRow {
	label: string;
	values: [
		string | boolean | null,
		string | boolean | null,
		string | boolean | null,
	];
	badge?: { label: string; variant: "default" | "secondary" };
}

export interface ComparisonSection {
	title: string;
	rows: ComparisonRow[];
}

export const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		title: "Usage",
		rows: [
			{ label: "Team members", values: ["1", "Unlimited", "Unlimited"] },
			{
				label: "Workspaces",
				values: ["Unlimited", "Unlimited", "Unlimited"],
			},
			{ label: "Projects", values: ["Unlimited", "Unlimited", "Unlimited"] },
		],
	},
	{
		title: "Features",
		rows: [
			{ label: "Desktop app", values: [true, true, true] },
			{ label: "Local workspaces", values: [true, true, true] },
			{
				label: "Remote workspaces",
				values: [null, true, true],
				badge: { label: "Beta", variant: "default" },
			},
			{ label: "Automations", values: [null, true, true] },
			{
				label: "Mobile app",
				values: [null, true, true],
				badge: { label: "Coming soon", variant: "secondary" },
			},
			{ label: "GitHub integration", values: [true, true, true] },
			{ label: "Linear integration", values: [null, true, true] },
			{ label: "Slack integration", values: [null, true, true] },
			{ label: "Team collaboration", values: [null, true, true] },
		],
	},
	{
		title: "Support",
		rows: [
			{ label: "Priority support", values: [null, null, true] },
			{ label: "Uptime SLA", values: [null, null, true] },
			{ label: "Custom contracts", values: [null, null, true] },
		],
	},
	{
		title: "Security",
		rows: [
			{ label: "SSO/SAML", values: [null, null, true] },
			{ label: "IP restrictions", values: [null, null, true] },
			{ label: "SCIM provisioning", values: [null, null, true] },
			{ label: "Audit log", values: [null, null, true] },
		],
	},
];

export const PRICING_FAQ_ITEMS: FAQItem[] = [
	{
		question: "Is there a free plan?",
		answer:
			"Yes. Free covers individuals with 1 user, local workspaces, the desktop app, and GitHub integration. No credit card required.",
	},
	{
		question: "How does Pro pricing work?",
		answer:
			"Pro is $20 per user/month billed monthly, or $15 per user/month billed yearly (a 25% discount). You're billed per active seat on your team.",
	},
	{
		question: "Can I switch plans or cancel anytime?",
		answer:
			"Yes. You can upgrade, downgrade, or cancel at any time from the billing settings inside the app. Changes take effect at the end of your current billing period.",
	},
	{
		question: "What's included in Enterprise?",
		answer:
			"Everything in Pro plus SSO & SAML, SCIM provisioning, IP restrictions, audit logs, a custom SLA, dedicated support, and custom contracts. Pricing is tailored to your organization — get in touch and we'll scope something that fits.",
	},
];
