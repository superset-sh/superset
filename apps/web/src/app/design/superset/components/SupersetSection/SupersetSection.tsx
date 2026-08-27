"use client";

import { Alerter, alert } from "@superset/ui/atoms/Alert";
import { Avatar } from "@superset/ui/atoms/Avatar";
import { Button } from "@superset/ui/button";
import type { ChatHistorySidebarMessage } from "@superset/ui/chat-history-sidebar";
import { ChatHistorySidebar } from "@superset/ui/chat-history-sidebar";
import { MeshGradient } from "@superset/ui/mesh-gradient";
import {
	CommentModeToggle,
	CommentProvider,
	type CommentStore,
	type CommentThread,
	PageCommentsView,
	type PageVisibility,
	PageVisibilityMenu,
} from "@superset/ui/page-comments";
import { Pixel404 } from "@superset/ui/pixel-404";
import { SidebarCard } from "@superset/ui/sidebar-card";
import { toast } from "@superset/ui/sonner";
import { ThemePreviewCard } from "@superset/ui/theme-preview-card";
import { useState } from "react";

import { ComponentCard } from "../../../components/ComponentCard";
import { ShowcaseSection } from "../../../components/ShowcaseSection";

const CHAT_HISTORY_MESSAGES: ChatHistorySidebarMessage[] = [
	{
		id: "u1",
		role: "user",
		preview: "Can you enrich the leads spreadsheet with company data from Exa?",
	},
	{
		id: "a1",
		role: "assistant",
		preview:
			"Sure — I'll read the sheet, look up each domain through the Exa API, and write the enriched columns back.",
	},
	{
		id: "u2",
		role: "user",
		preview: "How many rows are in the sheet total?",
	},
	{
		id: "a2",
		role: "assistant",
		preview:
			"The live tab has 665 data rows. 512 have a website domain we can enrich against.",
	},
	{
		id: "u3",
		role: "user",
		preview: "Run the whole list but skip anything already enriched",
	},
	{
		id: "a3",
		role: "assistant",
		preview:
			"Running now with a 4-way concurrency limit and checkpointing every 25 rows.",
	},
];

const DEMO_HTML = `<!doctype html><html><body style="font-family:system-ui;padding:24px;margin:0;">
<h1 style="margin:0 0 8px">Q3 rollout notes</h1>
<p>Ship the onboarding flow behind a flag, then expand to 100% once activation holds for a week.</p>
</body></html>`;

function usePageCommentsDemoStore(): CommentStore {
	const [threads, setThreads] = useState<CommentThread[]>([
		{
			id: "t1",
			anchor: { path: "body > h1", tag: "H1", text: "Q3 rollout notes" },
			resolved: false,
			comments: [
				{
					id: "c1",
					authorName: "Avi Peltz",
					authorImage: null,
					body: "Should this say Q4 now that the date slipped?",
					createdAt: Date.now() - 1000 * 60 * 40,
				},
			],
		},
	]);

	return {
		threads,
		isLoading: false,
		createThread: async ({ anchor, body }) => {
			setThreads((prev) => [
				...prev,
				{
					id: `t${prev.length + 1}`,
					anchor,
					resolved: false,
					comments: [
						{
							id: `c${prev.length + 1}`,
							authorName: "You",
							authorImage: null,
							body,
							createdAt: Date.now(),
						},
					],
				},
			]);
		},
		addReply: async (threadId, body) => {
			setThreads((prev) =>
				prev.map((t) =>
					t.id === threadId
						? {
								...t,
								comments: [
									...t.comments,
									{
										id: `${threadId}-${t.comments.length + 1}`,
										authorName: "You",
										authorImage: null,
										body,
										createdAt: Date.now(),
									},
								],
							}
						: t,
				),
			);
		},
		editComment: async (threadId, commentId, body) => {
			setThreads((prev) =>
				prev.map((t) =>
					t.id === threadId
						? {
								...t,
								comments: t.comments.map((c) =>
									c.id === commentId ? { ...c, body } : c,
								),
							}
						: t,
				),
			);
		},
		setResolved: async (threadId, resolved) => {
			setThreads((prev) =>
				prev.map((t) => (t.id === threadId ? { ...t, resolved } : t)),
			);
		},
		deleteThread: async (threadId) => {
			setThreads((prev) => prev.filter((t) => t.id !== threadId));
		},
	};
}

function PageCommentsDemo() {
	const store = usePageCommentsDemoStore();
	const [visibility, setVisibility] = useState<PageVisibility>("just_me");

	return (
		<CommentProvider
			user={{ id: "you", name: "You", image: null }}
			store={store}
		>
			<div className="flex w-full flex-col gap-2">
				<div className="flex items-center gap-2">
					<CommentModeToggle />
					<PageVisibilityMenu
						visibility={visibility}
						createdByUserId="you"
						currentUserId="you"
						onChange={async (v) => setVisibility(v)}
					/>
				</div>
				<div className="h-56 w-full overflow-hidden rounded-md border">
					<PageCommentsView html={DEMO_HTML} title="Q3 rollout notes" />
				</div>
			</div>
		</CommentProvider>
	);
}

export function SupersetSection() {
	return (
		<ShowcaseSection
			id="superset"
			index="01"
			title="Superset originals"
			description="Custom components beyond the shadcn set"
		>
			<Alerter />

			<ComponentCard
				title="Mesh Gradient"
				importPath="@superset/ui/mesh-gradient"
				description="Animated WebGL gradient (stripe-gradient)"
				bleed
			>
				<MeshGradient
					colors={["#0f172a", "#1e3a5f", "#0e7490", "#164e63"]}
					className="h-48 w-full"
				/>
			</ComponentCard>

			<ComponentCard
				title="Theme Preview Card"
				importPath="@superset/ui/theme-preview-card"
			>
				<ThemePreviewCard
					name="Superset Dark"
					subtitle="Default terminal theme"
					backgroundColor="#16161e"
					foregroundColor="#c0caf5"
					promptColor="#7aa2f7"
					infoColor="#e0af68"
					readyColor="#9ece6a"
					palette={[
						"#f7768e",
						"#9ece6a",
						"#e0af68",
						"#7aa2f7",
						"#bb9af7",
						"#7dcfff",
					]}
					className="w-full max-w-72"
				/>
			</ComponentCard>

			<ComponentCard
				title="Sidebar Card"
				importPath="@superset/ui/sidebar-card"
			>
				<SidebarCard
					badge="Beta"
					title="Mobile app"
					description="Monitor agents from your phone."
					actionLabel="Join TestFlight"
					onAction={() => toast("Opening TestFlight…")}
					onDismiss={() => toast("Dismissed")}
					className="w-full max-w-64"
				/>
			</ComponentCard>

			<ComponentCard
				title="Alert (imperative)"
				importPath="@superset/ui/atoms/Alert"
				description="alert() opens a promise-friendly dialog via the mounted Alerter"
			>
				<Button
					variant="outline"
					onClick={() =>
						alert({
							title: "Discard changes?",
							description:
								"The worktree has uncommitted edits from the agent session.",
							checkbox: { label: "Don't ask me again" },
							actions: [
								{ label: "Keep working", variant: "ghost" },
								{
									label: "Discard",
									variant: "destructive",
									onClick: ({ checkboxChecked }) => {
										toast(
											checkboxChecked
												? "Discarded — won't ask again"
												: "Discarded",
										);
									},
								},
							],
						})
					}
				>
					Trigger alert()
				</Button>
			</ComponentCard>

			<ComponentCard
				title="Avatar (atom)"
				importPath="@superset/ui/atoms/Avatar"
				description="Initials fallback via getInitials, sizes xs → xl"
			>
				<Avatar size="xs" fullName="Avi Peltz" />
				<Avatar size="sm" fullName="Avi Peltz" />
				<Avatar size="md" fullName="Avi Peltz" />
				<Avatar size="lg" fullName="Avi Peltz" />
				<Avatar size="xl" fullName="Avi Peltz" />
			</ComponentCard>

			<ComponentCard
				title="Chat History Sidebar"
				importPath="@superset/ui/chat-history-sidebar"
				description="Hover a dot to preview the exchange. ChatHistorySidebarScroller wraps this with @shadcn/react/message-scroller for scroll-linked active state — same rendered UI."
				bleed
			>
				<div className="relative h-56 w-full">
					<ChatHistorySidebar messages={CHAT_HISTORY_MESSAGES} />
				</div>
			</ComponentCard>

			<ComponentCard
				title="404 (pixel art)"
				importPath="@superset/ui/pixel-404"
			>
				<Pixel404 className="max-w-56 text-muted-foreground" />
			</ComponentCard>

			<ComponentCard
				title="Page Comments"
				importPath="@superset/ui/page-comments"
				description="CommentModeToggle + PageVisibilityMenu + PageCommentsView over an in-memory CommentStore mock"
				span
			>
				<PageCommentsDemo />
			</ComponentCard>
		</ShowcaseSection>
	);
}
