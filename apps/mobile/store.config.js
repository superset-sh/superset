// Dynamic so the demo-account credentials never enter the repo:
// set APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD when running `eas metadata:push`.
module.exports = {
	configVersion: 0,
	apple: {
		version: "1.0.0",
		copyright: "2026 Superset",
		categories: ["DEVELOPER_TOOLS", "PRODUCTIVITY"],
		info: {
			"en-US": {
				title: "Superset: AI Agent Manager",
				subtitle: "Run AI agents from anywhere",
				description:
					"Superset lets you run and manage AI coding agents from anywhere. Kick off tasks, review progress, and chat with agents working across your projects — all from your phone.\n\n- Start and monitor agent sessions in isolated workspaces\n- Chat with agents and attach images to your messages\n- Track tasks and pull requests across your organization\n- Stay in sync with your team in real time",
				keywords: [
					"coding agent",
					"AI agent",
					"developer tools",
					"pair programming",
					"automation",
					"terminal",
					"code review",
					"remote dev",
				],
				marketingUrl: "https://superset.sh",
				supportUrl: "https://superset.sh",
				privacyPolicyUrl: "https://superset.sh/privacy",
			},
		},
		review: {
			firstName: "Satya",
			lastName: "Patel",
			email: "support@superset.sh",
			phone: "+1 510 519 1602",
			demoRequired: true,
			demoUsername: process.env.APP_REVIEW_EMAIL ?? "",
			demoPassword: process.env.APP_REVIEW_PASSWORD ?? "",
			notes:
				"Superset Mobile is a companion app for the Superset desktop product (https://superset.sh): developers monitor and chat with AI coding agents running in their own workspaces. Access requires a Superset Pro subscription purchased outside the app (multiplatform service; there are no in-app purchases). Please use the provided demo account (sign in via the 'Sign in with email' link) to access a Pro workspace with sample data. Sign in with Apple, GitHub, or Google also works and creates a free account instantly, which shows the subscription-required screen. Account deletion is available from Settings, under Danger Zone. Settings is reachable even on the subscription-required screen, via the organization name in the top-left.",
		},
	},
};
