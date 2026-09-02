import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { COMPANY } from "@superset/shared/constants";

export type TierId = "free" | "pro" | "enterprise";

export interface PricingFeature {
	id: string;
	label: MessageDescriptor;
}

export interface PricingTier {
	id: TierId;
	name: MessageDescriptor;
	description: MessageDescriptor;
	price:
		| { kind: "fixed"; display: string; note: MessageDescriptor }
		| {
				kind: "variable";
				monthly: {
					display: string;
					note: MessageDescriptor;
					cadence: MessageDescriptor;
				};
				yearly: {
					display: string;
					note: MessageDescriptor;
					cadence: MessageDescriptor;
				};
		  }
		| { kind: "custom"; display: MessageDescriptor; note: MessageDescriptor };
	features: PricingFeature[];
	featureLimits?: Partial<Record<string, string>>;
	cta: {
		label: MessageDescriptor;
		href: string;
		variant: "default" | "outline" | "secondary";
		external?: boolean;
	};
	ctaNote?: { label: MessageDescriptor; href?: string };
	highlight?: boolean;
}

export const PRICING_TIERS: PricingTier[] = [
	{
		id: "free",
		name: msg({ id: "marketing.pricing.tier.free.name", message: "Free" }),
		description: msg({
			id: "marketing.pricing.tier.free.description",
			message: "For individuals getting started",
		}),
		price: {
			kind: "fixed",
			display: "$0",
			note: msg({
				id: "marketing.pricing.tier.free.priceNote",
				message: "Free for everyone",
			}),
		},
		features: [
			{
				id: "users",
				label: msg({
					id: "marketing.pricing.tier.free.feature.users",
					message: "1 user",
				}),
			},
			{
				id: "localWorkspaces",
				label: msg({
					id: "marketing.pricing.tier.free.feature.localWorkspaces",
					message: "Local workspaces",
				}),
			},
			{
				id: "desktopApp",
				label: msg({
					id: "marketing.pricing.tier.free.feature.desktopApp",
					message: "Desktop app",
				}),
			},
			{
				id: "githubIntegration",
				label: msg({
					id: "marketing.pricing.tier.free.feature.githubIntegration",
					message: "GitHub integration",
				}),
			},
			{
				id: "cli",
				label: msg({
					id: "marketing.pricing.tier.free.feature.cli",
					message: "CLI",
				}),
			},
		],
		cta: {
			label: msg({
				id: "marketing.pricing.cta.downloadApp",
				message: "Download app",
			}),
			href: "/download",
			variant: "outline",
		},
		ctaNote: {
			label: msg({
				id: "marketing.pricing.tier.free.ctaNote",
				message: "No credit card required.",
			}),
		},
	},
	{
		id: "pro",
		name: msg({ id: "marketing.pricing.tier.pro.name", message: "Pro" }),
		description: msg({
			id: "marketing.pricing.tier.pro.description",
			message: "For teams that need more power",
		}),
		price: {
			kind: "variable",
			monthly: {
				display: "$20",
				note: msg({
					id: "marketing.pricing.perUserMonth",
					message: "per user/month",
				}),
				cadence: msg({
					id: "marketing.pricing.tier.pro.billedMonthly",
					message: "Billed monthly",
				}),
			},
			yearly: {
				display: "$15",
				note: msg({
					id: "marketing.pricing.perUserMonth",
					message: "per user/month",
				}),
				cadence: msg({
					id: "marketing.pricing.tier.pro.billedYearly",
					message: "$180 per user, billed yearly",
				}),
			},
		},
		features: [
			{
				id: "everythingInFree",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.everythingInFree",
					message: "Everything in Free",
				}),
			},
			{
				id: "unlimitedUsers",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.unlimitedUsers",
					message: "Unlimited users",
				}),
			},
			{
				id: "remoteAccess",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.remoteAccess",
					message: "Remote access",
				}),
			},
			{
				id: "linearIntegration",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.linearIntegration",
					message: "Linear integration",
				}),
			},
			{
				id: "slackIntegration",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.slackIntegration",
					message: "Slack integration",
				}),
			},
			{
				id: "mobile",
				label: msg({
					id: "marketing.pricing.tier.pro.feature.mobile",
					message: "Mobile (coming soon)",
				}),
			},
		],
		cta: {
			label: msg({
				id: "marketing.pricing.cta.downloadApp",
				message: "Download app",
			}),
			href: "/download",
			variant: "default",
		},
		highlight: true,
	},
	{
		id: "enterprise",
		name: msg({
			id: "marketing.pricing.tier.enterprise.name",
			message: "Enterprise",
		}),
		description: msg({
			id: "marketing.pricing.tier.enterprise.description",
			message: "For organizations with advanced needs",
		}),
		price: {
			kind: "custom",
			display: msg({
				id: "marketing.pricing.tier.enterprise.priceDisplay",
				message: "Custom pricing",
			}),
			note: msg({
				id: "marketing.pricing.tier.enterprise.priceNote",
				message: "Annual billing only",
			}),
		},
		features: [
			{
				id: "everythingInPro",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.everythingInPro",
					message: "Everything in Pro",
				}),
			},
			{
				id: "ssoScim",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.ssoScim",
					message: "SAML SSO & SCIM provisioning",
				}),
			},
			{
				id: "auditLogs",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.auditLogs",
					message: "Audit logs",
				}),
			},
			{
				id: "soc2",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.soc2",
					message: "SOC 2 Type II report",
				}),
			},
			{
				id: "slaSupport",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.slaSupport",
					message: "Uptime SLA & dedicated support",
				}),
			},
			{
				id: "customIntegrations",
				label: msg({
					id: "marketing.pricing.tier.enterprise.feature.customIntegrations",
					message: "Custom integrations",
				}),
			},
		],
		cta: {
			label: msg({
				id: "marketing.pricing.cta.contactSales",
				message: "Contact sales",
			}),
			href: "/enterprise",
			variant: "outline",
		},
		ctaNote: {
			label: msg({
				id: "marketing.pricing.tier.enterprise.ctaNote",
				message: "Review our security",
			}),
			href: COMPANY.TRUST_URL,
		},
	},
];

// Plain strings stay raw numerals ("1"); anything with words is a descriptor.
export type ComparisonValue = string | boolean | MessageDescriptor;

export interface ComparisonRow {
	id: string;
	label: MessageDescriptor;
	values: [
		ComparisonValue | null,
		ComparisonValue | null,
		ComparisonValue | null,
	];
	badge?: {
		label: MessageDescriptor;
		variant: "default" | "secondary";
	};
}

export interface ComparisonSection {
	id: string;
	title: MessageDescriptor;
	rows: ComparisonRow[];
}

const UNLIMITED = msg({
	id: "marketing.pricing.comparison.unlimited",
	message: "Unlimited",
});

export const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		id: "usage",
		title: msg({
			id: "marketing.pricing.comparison.usage.title",
			message: "Usage",
		}),
		rows: [
			{
				id: "teamMembers",
				label: msg({
					id: "marketing.pricing.comparison.usage.teamMembers",
					message: "Team members",
				}),
				values: ["1", UNLIMITED, UNLIMITED],
			},
			{
				id: "workspaces",
				label: msg({
					id: "marketing.pricing.comparison.usage.workspaces",
					message: "Workspaces",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
			{
				id: "projects",
				label: msg({
					id: "marketing.pricing.comparison.usage.projects",
					message: "Projects",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
		],
	},
	{
		id: "features",
		title: msg({
			id: "marketing.pricing.comparison.features.title",
			message: "Features",
		}),
		rows: [
			{
				id: "desktopApp",
				label: msg({
					id: "marketing.pricing.comparison.features.desktopApp",
					message: "Desktop app",
				}),
				values: [true, true, true],
			},
			{
				id: "localWorkspaces",
				label: msg({
					id: "marketing.pricing.comparison.features.localWorkspaces",
					message: "Local workspaces",
				}),
				values: [true, true, true],
			},
			{
				id: "remoteAccess",
				label: msg({
					id: "marketing.pricing.comparison.features.remoteAccess",
					message: "Remote access",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						id: "marketing.pricing.comparison.badge.beta",
						message: "Beta",
					}),
					variant: "default",
				},
			},
			{
				id: "automations",
				label: msg({
					id: "marketing.pricing.comparison.features.automations",
					message: "Automations",
				}),
				values: [true, true, true],
			},
			{
				id: "mobileApp",
				label: msg({
					id: "marketing.pricing.comparison.features.mobileApp",
					message: "Mobile app",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						id: "marketing.pricing.comparison.badge.comingSoon",
						message: "Coming soon",
					}),
					variant: "secondary",
				},
			},
			{
				id: "githubIntegration",
				label: msg({
					id: "marketing.pricing.comparison.features.githubIntegration",
					message: "GitHub integration",
				}),
				values: [true, true, true],
			},
			{
				id: "linearIntegration",
				label: msg({
					id: "marketing.pricing.comparison.features.linearIntegration",
					message: "Linear integration",
				}),
				values: [null, true, true],
			},
			{
				id: "slackIntegration",
				label: msg({
					id: "marketing.pricing.comparison.features.slackIntegration",
					message: "Slack integration",
				}),
				values: [null, true, true],
			},
			{
				id: "teamCollaboration",
				label: msg({
					id: "marketing.pricing.comparison.features.teamCollaboration",
					message: "Team collaboration",
				}),
				values: [null, true, true],
			},
		],
	},
	{
		id: "support",
		title: msg({
			id: "marketing.pricing.comparison.support.title",
			message: "Support",
		}),
		rows: [
			{
				id: "prioritySupport",
				label: msg({
					id: "marketing.pricing.comparison.support.prioritySupport",
					message: "Priority support",
				}),
				values: [null, null, true],
			},
			{
				id: "uptimeSla",
				label: msg({
					id: "marketing.pricing.comparison.support.uptimeSla",
					message: "Uptime SLA",
				}),
				values: [null, null, true],
			},
			{
				id: "customContracts",
				label: msg({
					id: "marketing.pricing.comparison.support.customContracts",
					message: "Custom contracts",
				}),
				values: [null, null, true],
			},
		],
	},
	{
		id: "security",
		title: msg({
			id: "marketing.pricing.comparison.security.title",
			message: "Security",
		}),
		rows: [
			{
				id: "sso",
				label: msg({
					id: "marketing.pricing.comparison.security.sso",
					message: "SSO/SAML",
				}),
				values: [null, null, true],
			},
			{
				id: "ipRestrictions",
				label: msg({
					id: "marketing.pricing.comparison.security.ipRestrictions",
					message: "IP restrictions",
				}),
				values: [null, null, true],
			},
			{
				id: "scim",
				label: msg({
					id: "marketing.pricing.comparison.security.scim",
					message: "SCIM provisioning",
				}),
				values: [null, null, true],
			},
			{
				id: "auditLog",
				label: msg({
					id: "marketing.pricing.comparison.security.auditLog",
					message: "Audit log",
				}),
				values: [null, null, true],
			},
			{
				id: "soc2",
				label: msg({
					id: "marketing.pricing.comparison.security.soc2",
					message: "SOC 2 Type II report",
				}),
				values: [null, null, true],
			},
		],
	},
];

export interface PricingFAQItem {
	id: string;
	question: MessageDescriptor;
	answer: MessageDescriptor;
}

export const PRICING_FAQ_ITEMS: PricingFAQItem[] = [
	{
		id: "freePlan",
		question: msg({
			id: "marketing.pricing.faq.freePlan.question",
			message: "Is there a free plan?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.freePlan.answer",
			message:
				"Yes. Free covers individuals with 1 user, local workspaces, the desktop app, the CLI, and GitHub integration. No credit card required.",
		}),
	},
	{
		id: "proPricing",
		question: msg({
			id: "marketing.pricing.faq.proPricing.question",
			message: "How does Pro pricing work?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.proPricing.answer",
			message:
				"Pro is $20 per user/month billed monthly, or $15 per user/month billed yearly (a 25% discount). You're billed per active seat on your team.",
		}),
	},
	{
		id: "switchPlans",
		question: msg({
			id: "marketing.pricing.faq.switchPlans.question",
			message: "Can I switch plans or cancel anytime?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.switchPlans.answer",
			message:
				"Yes. You can upgrade, downgrade, or cancel at any time from the billing settings inside the app. Changes take effect at the end of your current billing period.",
		}),
	},
	{
		id: "enterpriseIncludes",
		question: msg({
			id: "marketing.pricing.faq.enterpriseIncludes.question",
			message: "What's included in Enterprise?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.enterpriseIncludes.answer",
			message:
				"Everything in Pro plus SSO & SAML, SCIM provisioning, IP restrictions, audit logs, a custom SLA, dedicated support, and custom contracts. Pricing is tailored to your organization. Get in touch and we'll scope something that fits.",
		}),
	},
	{
		id: "soc2",
		question: msg({
			id: "marketing.pricing.faq.soc2.question",
			message: "Is Superset SOC 2 compliant?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.soc2.answer",
			message:
				"Yes. Superset has completed a SOC 2 Type II audit with an independent auditor, covering our security controls in operation over time. Request the report and review our security documentation at trust.superset.sh.",
		}),
	},
	{
		id: "whereCodeRuns",
		question: msg({
			id: "marketing.pricing.faq.whereCodeRuns.question",
			message: "Where does my code run?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.whereCodeRuns.answer",
			message:
				"On your machine. Repos, worktrees, terminal output, and agent sessions stay local by default; cloud sync covers account and organization metadata only. Superset doesn't proxy any API calls.",
		}),
	},
	{
		id: "agentSubscriptions",
		question: msg({
			id: "marketing.pricing.faq.agentSubscriptions.question",
			message: "Do I need my own coding agent subscriptions?",
		}),
		answer: msg({
			id: "marketing.pricing.faq.agentSubscriptions.answer",
			message:
				"Yes. Superset is the workspace your agents run in, not a model provider. Bring Claude Code, Codex, OpenCode, or any CLI agent, and use your existing accounts or API keys on every plan.",
		}),
	},
];
