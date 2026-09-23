// Dynamic so the demo-account credentials never enter the repo: they come from
// APP_REVIEW_EMAIL / APP_REVIEW_PASSWORD in the root .env (or the shell).
// Optionally set APP_REVIEW_VIDEO_URL to a short screen recording of the
// sign-in and review flow; reviewers reliably follow a video where they skim text.
// Submission checklist and what to do on rejection or delay: see RELEASE.md.

const path = require("node:path");
require("dotenv").config({
	path: path.resolve(__dirname, "../../.env"),
	quiet: true,
});

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
	"Payments (3.1): Superset is sold to organizations. A Pro plan is purchased by the organization on the web and unlocks Superset Mobile for every member. The app sells nothing and has no purchase buttons. Free accounts see an informational screen that explains Pro is required.",
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
		version: "1.1.2",
		copyright: "2026 Superset",
		categories: ["DEVELOPER_TOOLS", "PRODUCTIVITY"],
		info: {
			"en-US": {
				title: "Superset: 100+ Coding Agents",
				subtitle: "Manage AI agents on the go",
				promoText:
					"Your agents keep working when you leave your desk. Start a task, follow it live, and review the diff from your phone.",
				description:
					"Meet Superset, the phone app for the coding agents running on your computer. Start a task, watch the agent work, answer its questions, and review the diff before anything merges, without opening your laptop.\n\nAI CODING AGENTS ON YOUR PHONE\nStart work the moment an idea lands. Pick a project and branch, choose an agent and model, and send the task. Every session runs in its own isolated workspace, so nothing touches your main branch until you decide it should.\n\nFOLLOW EVERY SESSION LIVE\nSee what your agents are doing as they do it. Read their output, watch the commands they run, and know at a glance which sessions are working, which need your permission, and which are finished and waiting for you. Open the terminal when you want the raw output.\n\nCODE REVIEW ON THE GO\nRead every change file by file with syntax highlighting. Comment on specific lines, then send your review back to the agent in one step so it can make the fixes. Open the pull request, check its status, and merge it from your phone.\n\nNO TYPING NEEDED\nDictate instructions when typing on a phone is a chore. Snap a whiteboard sketch or attach a screenshot of a bug, and the agent gets it with your message.\n\nWORKS WITH THE AGENTS YOU ALREADY USE\nClaude Code, Codex, Gemini CLI, Cursor Agent, GitHub Copilot, OpenCode, Amp, and more terminal agents. Superset is not affiliated with their makers.\n\nYOUR CODE STAYS ON YOUR MACHINE\nYour agents, shells, and code run on your own computer. The phone shows what they are doing and sends your input back. Nothing is downloaded or run on your device.\n\nSuperset helps you:\n▶ Start agent tasks on your own computer from anywhere\n▶ See which sessions need you and which are done\n▶ Review diffs and leave line-by-line comments\n▶ Send review feedback straight back to the agent\n▶ Merge pull requests without opening your laptop\n▶ Dictate instructions and attach photos and screenshots\n▶ Keep up with your team's workspaces across projects\n\nGET STARTED\nSuperset Mobile pairs with the Superset desktop app. Install it on your computer from superset.sh, sign in with the same account on your phone, and your machines appear with their workspaces and sessions. Superset Mobile is included with Superset Pro for organizations.",
				keywords: [
					"code review",
					"pull request",
					"diff",
					"terminal",
					"git",
					"developer",
					"programming",
					"remote",
					"vibe coding",
					"llm",
					"assistant",
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
			phone: "+1 949 836 1199",
			demoRequired: true,
			demoUsername: process.env.APP_REVIEW_EMAIL ?? "",
			demoPassword: process.env.APP_REVIEW_PASSWORD ?? "",
			notes: reviewNotes,
		},
	},
};
