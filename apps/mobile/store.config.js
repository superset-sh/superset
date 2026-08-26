// Dynamic so the demo-account credentials never enter the repo:
// set APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD when running `eas metadata:push`.
// Optionally set APP_REVIEW_VIDEO_URL to a short screen recording of the
// sign-in and review flow; reviewers reliably follow a video where they skim text.
// Submission checklist and what to do on rejection or delay: see RELEASE.md.

const reviewVideoUrl = process.env.APP_REVIEW_VIDEO_URL ?? "";

// App Review reads these notes under time pressure, so they lead with what the
// app is (a remote client, nothing runs on the device) and then address the
// guidelines a reviewer is most likely to check, each under a short heading.
const reviewNotes = [
	"WHAT THE APP IS",
	"Superset Mobile is the companion app for Superset (https://superset.sh), a desktop tool where developers run AI coding agents on their own computers or in Superset cloud workspaces. The phone app is a remote client for those sessions, in the same class as an SSH or remote desktop client: it shows agent progress, lets the user chat with an agent, review file diffs, and type into a terminal session that is running on the user's own machine. The app does not download, install, or execute any user or project code on the device: it renders data streamed from the user's host and sends keystrokes back to the remote session.",
	"",
	"HOW TO REVIEW",
	"1. On the sign-in screen tap 'Sign in with email' and use the demo account below (no two-factor prompt; the account belongs to an organization that already has a workspace with sample agent sessions, so nothing needs to be installed to see the full app).",
	"2. Home lists workspaces and sessions. Open a session to read the agent transcript, chat with it, view the files it changed, and open the terminal.",
	"3. Settings is reachable from the organization name in the top-left; account deletion is there under Danger Zone.",
	reviewVideoUrl
		? `A two-minute walkthrough of these steps: ${reviewVideoUrl}`
		: null,
	"",
	"GUIDELINES WE EXPECT YOU TO CHECK",
	"Payments (3.1): Superset is sold to organizations. A Pro plan is purchased by the organization on the web and unlocks Superset Mobile for every member. The app sells nothing, has no purchase buttons, and does not link to a purchase page. Free accounts see an informational screen that explains Pro is required and offers a Refresh button.",
	"Sign-in (4.8): Sign in with Apple is offered alongside GitHub, Google, and email. Any of them creates a free account instantly, which lands on the Pro-required screen described above; the demo account is the one with a paid workspace.",
	"Account deletion (5.1.1 v): Settings > Danger Zone > Delete account, in-app, no email or web visit required.",
	"Code execution (2.5.2): No user or project code is downloaded or executed on the device. The terminal tab renders output streamed from the user's own session and sends keystrokes to it; the agents themselves run on the user's computer or in their cloud workspace.",
	"Originality (4.3): This is the official mobile client for Superset, our own product, built and operated by Superset Inc. It is not a template, a repackaged app, or a wrapper around another vendor's tool: it talks to our own API (api.superset.sh) and to the Superset host agent that our desktop app installs (plus crash and usage reporting through Sentry and PostHog, declared in App Privacy), and the bundle identifier (sh.superset.mobile) matches our domain. The full source of this app is public in our repository at https://github.com/superset-sh/superset (apps/mobile, 13,000+ stars), alongside the desktop app it pairs with, which has been downloaded millions of times. Other apps in this category are phone front-ends for a third-party CLI; Superset Mobile only works with Superset accounts, workspaces, and hosts.",
	"Permissions: Photos and camera are used only to attach images to chat messages; microphone and speech recognition are used only to dictate a message. Each prompt appears the first time the feature is used and the app works without any of them.",
	"",
	"Questions: support@superset.sh, or call the contact above; we respond within the hour during US business hours.",
]
	.filter((line) => line !== null)
	.join("\n");

module.exports = {
	configVersion: 0,
	apple: {
		version: "1.0.0",
		copyright: "2026 Superset",
		categories: ["DEVELOPER_TOOLS", "PRODUCTIVITY"],
		info: {
			"en-US": {
				title: "Superset: 100+ Coding Agents",
				subtitle: "Superset desktop companion",
				promoText:
					"Your agents don't stop when you leave your desk. Start work, follow it live, and review the diff from your phone.",
				description:
					"Superset Mobile is the official companion app for Superset, the desktop app where developers run AI coding agents on their own machines. Start a task, follow the agent while it works, chat with it, and review the diff, all from your phone.\n\nHOW IT WORKS\nSign in with the same account you use on the desktop app. Every machine you have connected shows up on your phone with its workspaces and agent sessions. Your agents, shells, and code stay on your computer or in your Superset cloud workspace; the phone only shows what they are doing and sends your input back.\n\nSTART WORK FROM ANYWHERE\nLaunch an agent on any connected machine the moment an idea lands. Every session runs in its own isolated workspace, so nothing touches your main branch until you decide it should.\n\nFOLLOW EVERY SESSION\nWatch agents work in real time. Read their reasoning, see the commands they run, and step in with a follow-up or a photo the moment they need direction. Dictate a message when typing is a chore.\n\nREVIEW BEFORE YOU MERGE\nRead the full diff on your phone, file by file with syntax highlighting, and open a terminal to the session when you need the raw output.\n\nWORKS WITH THE AGENTS YOU ALREADY USE\nClaude Code, Codex, Gemini CLI, Cursor Agent, Copilot, OpenCode, Amp, and other terminal agents. Superset is not affiliated with their makers.\n\nBUILT FOR TEAMS\nTrack workspaces across your organization, switch between projects, and stay in sync with what your team's agents are doing.\n\nSuperset Mobile pairs with the Superset desktop app (https://superset.sh) and is included with Superset Pro for organizations.",
				keywords: [
					"coding agent",
					"ai",
					"developer tools",
					"pair programming",
					"automation",
					"code review",
					"git",
					"remote",
					"terminal",
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
			notes: reviewNotes,
		},
	},
};
