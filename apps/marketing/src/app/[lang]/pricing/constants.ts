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
		name: msg({ message: "Free" }),
		description: msg({
			message: "For individuals getting started",
		}),
		price: {
			kind: "fixed",
			display: "$0",
			note: msg({
				message: "Free for everyone",
			}),
		},
		features: [
			{
				id: "users",
				label: msg({
					message: "1 user",
				}),
			},
			{
				id: "localWorkspaces",
				label: msg({
					message: "Local workspaces",
				}),
			},
			{
				id: "desktopApp",
				label: msg({
					message: "Desktop app",
				}),
			},
			{
				id: "githubIntegration",
				label: msg({
					message: "GitHub integration",
				}),
			},
			{
				id: "cli",
				label: msg({
					message: "CLI",
				}),
			},
		],
		cta: {
			label: msg({
				message: "Download app",
			}),
			href: "/download",
			variant: "outline",
		},
		ctaNote: {
			label: msg({
				message: "No credit card required.",
			}),
		},
	},
	{
		id: "pro",
		name: msg({ message: "Pro" }),
		description: msg({
			message: "For teams that need more power",
		}),
		price: {
			kind: "variable",
			monthly: {
				display: "$20",
				note: msg({
					message: "per user/month",
				}),
				cadence: msg({
					message: "Billed monthly",
				}),
			},
			yearly: {
				display: "$15",
				note: msg({
					message: "per user/month",
				}),
				cadence: msg({
					message: "$180 per user, billed yearly",
				}),
			},
		},
		features: [
			{
				id: "everythingInFree",
				label: msg({
					message: "Everything in Free",
				}),
			},
			{
				id: "unlimitedUsers",
				label: msg({
					message: "Unlimited users",
				}),
			},
			{
				id: "remoteAccess",
				label: msg({
					message: "Remote access",
				}),
			},
			{
				id: "linearIntegration",
				label: msg({
					message: "Linear integration",
				}),
			},
			{
				id: "slackIntegration",
				label: msg({
					message: "Slack integration",
				}),
			},
			{
				id: "mobile",
				label: msg({
					message: "Mobile (coming soon)",
				}),
			},
		],
		cta: {
			label: msg({
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
			message: "Enterprise",
		}),
		description: msg({
			message: "For organizations with advanced needs",
		}),
		price: {
			kind: "custom",
			display: msg({
				message: "Custom pricing",
			}),
			note: msg({
				message: "Annual billing only",
			}),
		},
		features: [
			{
				id: "everythingInPro",
				label: msg({
					message: "Everything in Pro",
				}),
			},
			{
				id: "ssoScim",
				label: msg({
					message: "SAML SSO & SCIM provisioning",
				}),
			},
			{
				id: "auditLogs",
				label: msg({
					message: "Audit logs",
				}),
			},
			{
				id: "soc2",
				label: msg({
					message: "SOC 2 Type II report",
				}),
			},
			{
				id: "slaSupport",
				label: msg({
					message: "Uptime SLA & dedicated support",
				}),
			},
			{
				id: "customIntegrations",
				label: msg({
					message: "Custom integrations",
				}),
			},
		],
		cta: {
			label: msg({
				message: "Contact sales",
			}),
			href: "/enterprise",
			variant: "outline",
		},
		ctaNote: {
			label: msg({
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
	message: "Unlimited",
});

export const COMPARISON_SECTIONS: ComparisonSection[] = [
	{
		id: "usage",
		title: msg({
			message: "Usage",
		}),
		rows: [
			{
				id: "teamMembers",
				label: msg({
					message: "Team members",
				}),
				values: ["1", UNLIMITED, UNLIMITED],
			},
			{
				id: "workspaces",
				label: msg({
					message: "Workspaces",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
			{
				id: "projects",
				label: msg({
					message: "Projects",
				}),
				values: [UNLIMITED, UNLIMITED, UNLIMITED],
			},
		],
	},
	{
		id: "features",
		title: msg({
			message: "Features",
		}),
		rows: [
			{
				id: "desktopApp",
				label: msg({
					message: "Desktop app",
				}),
				values: [true, true, true],
			},
			{
				id: "localWorkspaces",
				label: msg({
					message: "Local workspaces",
				}),
				values: [true, true, true],
			},
			{
				id: "remoteAccess",
				label: msg({
					message: "Remote access",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						message: "Beta",
					}),
					variant: "default",
				},
			},
			{
				id: "automations",
				label: msg({
					message: "Automations",
				}),
				values: [true, true, true],
			},
			{
				id: "mobileApp",
				label: msg({
					message: "Mobile app",
				}),
				values: [null, true, true],
				badge: {
					label: msg({
						message: "Coming soon",
					}),
					variant: "secondary",
				},
			},
			{
				id: "githubIntegration",
				label: msg({
					message: "GitHub integration",
				}),
				values: [true, true, true],
			},
			{
				id: "linearIntegration",
				label: msg({
					message: "Linear integration",
				}),
				values: [null, true, true],
			},
			{
				id: "slackIntegration",
				label: msg({
					message: "Slack integration",
				}),
				values: [null, true, true],
			},
			{
				id: "teamCollaboration",
				label: msg({
					message: "Team collaboration",
				}),
				values: [null, true, true],
			},
		],
	},
	{
		id: "support",
		title: msg({
			message: "Support",
		}),
		rows: [
			{
				id: "prioritySupport",
				label: msg({
					message: "Priority support",
				}),
				values: [null, null, true],
			},
			{
				id: "uptimeSla",
				label: msg({
					message: "Uptime SLA",
				}),
				values: [null, null, true],
			},
			{
				id: "customContracts",
				label: msg({
					message: "Custom contracts",
				}),
				values: [null, null, true],
			},
		],
	},
	{
		id: "security",
		title: msg({
			message: "Security",
		}),
		rows: [
			{
				id: "sso",
				label: msg({
					message: "SSO/SAML",
				}),
				values: [null, null, true],
			},
			{
				id: "ipRestrictions",
				label: msg({
					message: "IP restrictions",
				}),
				values: [null, null, true],
			},
			{
				id: "scim",
				label: msg({
					message: "SCIM provisioning",
				}),
				values: [null, null, true],
			},
			{
				id: "auditLog",
				label: msg({
					message: "Audit log",
				}),
				values: [null, null, true],
			},
			{
				id: "soc2",
				label: msg({
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
			message: "Is there a free plan?",
		}),
		answer: msg({
			message:
				"Yes. Free covers individuals with 1 user, local workspaces, the desktop app, the CLI, and GitHub integration. No credit card required.",
		}),
	},
	{
		id: "proPricing",
		question: msg({
			message: "How does Pro pricing work?",
		}),
		answer: msg({
			message:
				"Pro is $20 per user/month billed monthly, or $15 per user/month billed yearly (a 25% discount). You're billed per active seat on your team.",
		}),
	},
	{
		id: "switchPlans",
		question: msg({
			message: "Can I switch plans or cancel anytime?",
		}),
		answer: msg({
			message:
				"Yes. You can upgrade, downgrade, or cancel at any time from the billing settings inside the app. Changes take effect at the end of your current billing period.",
		}),
	},
	{
		id: "enterpriseIncludes",
		question: msg({
			message: "What's included in Enterprise?",
		}),
		answer: msg({
			message:
				"Everything in Pro plus SSO & SAML, SCIM provisioning, IP restrictions, audit logs, a custom SLA, dedicated support, and custom contracts. Pricing is tailored to your organization. Get in touch and we'll scope something that fits.",
		}),
	},
	{
		id: "soc2",
		question: msg({
			message: "Is Superset SOC 2 compliant?",
		}),
		answer: msg({
			message:
				"Yes. Superset has completed a SOC 2 Type II audit with an independent auditor, covering our security controls in operation over time. Request the report and review our security documentation at trust.superset.sh.",
		}),
	},
	{
		id: "whereCodeRuns",
		question: msg({
			message: "Where does my code run?",
		}),
		answer: msg({
			message:
				"On your machine. Repos, worktrees, terminal output, and agent sessions stay local by default; cloud sync covers account and organization metadata only. Superset doesn't proxy any API calls.",
		}),
	},
	{
		id: "agentSubscriptions",
		question: msg({
			message: "Do I need my own coding agent subscriptions?",
		}),
		answer: msg({
			message:
				"Yes. Superset is the workspace your agents run in, not a model provider. Bring Claude Code, Codex, OpenCode, or any CLI agent, and use your existing accounts or API keys on every plan.",
		}),
	},
];
