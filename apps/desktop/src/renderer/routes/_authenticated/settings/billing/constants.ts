export const PLAN_TIERS = ["free", "pro", "enterprise"] as const;
export type PlanTier = (typeof PLAN_TIERS)[number];

export interface PlanFeature {
	id: string;
	name: string;
	description?: string;
	included: boolean;
	limit?: string;
}

export interface Plan {
	id: PlanTier;
	name: string;
	description: string;
	price: {
		monthly: number;
		yearly?: number;
	} | null;
	limits: {
		maxUsers: number | null;
		maxWorkspaces: number | null;
		cloudWorkspaces: boolean;
		mobileApp: boolean;
	};
	features: PlanFeature[];
	cta: {
		text: string;
		action: "current" | "upgrade" | "contact";
		disabled?: boolean;
	};
}

export const PLANS: Record<PlanTier, Plan> = {
	free: {
		id: "free",
		name: "Free",
		description: "For individuals getting started",
		price: null,
		limits: {
			maxUsers: 1,
			maxWorkspaces: 5,
			cloudWorkspaces: false,
			mobileApp: false,
		},
		features: [
			{ id: "users", name: "1 user", included: true },
			{ id: "workspaces", name: "Up to 5 workspaces", included: true },
			{ id: "local-only", name: "Local workspaces only", included: true },
			{ id: "desktop-app", name: "Desktop app", included: true },
		],
		cta: { text: "Current plan", action: "current", disabled: true },
	},
	pro: {
		id: "pro",
		name: "Pro",
		description: "For teams that need more power",
		price: { monthly: 2000, yearly: 18000 },
		limits: {
			maxUsers: null,
			maxWorkspaces: null,
			cloudWorkspaces: true,
			mobileApp: true,
		},
		features: [
			{
				id: "users",
				name: "Unlimited users",
				included: true,
				limit: "$20/seat",
			},
			{ id: "tasks", name: "Task management", included: true },
			{ id: "cloud", name: "Cloud workspaces", included: true },
			{ id: "mobile", name: "Mobile app access", included: true },
			{ id: "priority", name: "Priority support", included: true },
			{ id: "roles", name: "Role-based permissions", included: true },
		],
		cta: { text: "Upgrade to Pro", action: "upgrade" },
	},
	enterprise: {
		id: "enterprise",
		name: "Enterprise",
		description: "For organizations with advanced needs",
		price: null,
		limits: {
			maxUsers: null,
			maxWorkspaces: null,
			cloudWorkspaces: true,
			mobileApp: true,
		},
		features: [
			{ id: "everything-pro", name: "Everything in Pro", included: true },
			{
				id: "sso",
				name: "SSO & advanced security",
				included: true,
			},
			{ id: "audit", name: "Audit logs", included: true },
			{
				id: "sla",
				name: "SLA & dedicated support",
				included: true,
			},
			{ id: "custom", name: "Custom integrations", included: true },
		],
		cta: { text: "Contact sales", action: "contact" },
	},
};

export interface BillingInfo {
	organizationId: string;
	currentPlan: PlanTier;
	seats: number;
	usage: {
		users: number;
		workspaces: number;
	};
	billing?: {
		stripeCustomerId: string;
		nextBillingDate: string;
		amount: number;
	};
}

export const MOCK_BILLING_INFO: BillingInfo = {
	organizationId: "mock-org",
	currentPlan: "free",
	seats: 1,
	usage: {
		users: 1,
		workspaces: 3,
	},
};
