import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
import { errorMessage } from "@superset/i18n/errors";
import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { toast } from "@superset/ui/sonner";
import {
	AppWindowIcon,
	BellIcon,
	BellOffIcon,
	CircleCheckIcon,
	DownloadIcon,
	InfoIcon,
	KeyboardIcon,
	MegaphoneIcon,
	OctagonAlertIcon,
	PaletteIcon,
	PanelLeftIcon,
	PanelRightIcon,
	RefreshCwIcon,
	StarIcon,
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import { previewStarNagOnboardingToast } from "renderer/components/StarNagToast";
import { env } from "renderer/env.renderer";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useDesktopNoticePreviewStore } from "renderer/stores/desktop-notice-preview";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import {
	STAR_NAG_INITIAL_THRESHOLD,
	useStarNagStore,
} from "renderer/stores/star-nag";
import { SYSTEM_THEME_ID, useThemeStore } from "renderer/stores/theme/store";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { Command, CommandProvider } from "../../core/types";
import { ThemeFrame } from "../../ui/ThemeFrame/ThemeFrame";
import { checkResourcesCommand, openUsageCommand } from "../resources/commands";

/** Dev-only fake notices for previewing each surface via the command palette. */
const PREVIEW_NOTICES = {
	info: {
		id: "preview.info",
		severity: "info",
		trigger: "immediate",
		body: "### New in this version\n\nThis is a **preview** of an info notice. Markdown, [links](https://superset.sh), and images render here.",
		cta: {
			label: "Read the changelog",
			action: "open-url",
			url: "https://superset.sh/changelog",
		},
		dismissible: true,
	},
	warning: {
		id: "preview.warning",
		severity: "warning",
		trigger: "immediate",
		body: "![What's changing](https://superset.sh/og-image.png)\n\n### Heads up: breaking changes ahead\n\nThis is a **preview** of a warning notice about the next version, with a title image at the top of the markdown body.",
		cta: { label: "Update now", action: "install-update" },
		dismissible: true,
	},
	blocking: {
		id: "preview.blocking",
		severity: "blocking",
		trigger: "immediate",
		body: "This is a preview of the blocking forced-update page. Press Esc to exit the preview.",
		cta: { label: "Install & restart", action: "install-update" },
		dismissible: false,
	},
	postUpdate: {
		id: "preview.post-update",
		severity: "info",
		trigger: "post-update",
		body: "### What's new\n\nThis is a **preview** of a post-update announcement.",
		cta: {
			label: "See the changelog",
			action: "open-url",
			url: "https://superset.sh/changelog",
		},
		dismissible: true,
	},
	preUpdate: {
		id: "preview.pre-update",
		severity: "warning",
		trigger: "pre-update",
		body: "**Before you update**\n\nThis is a **preview** of the pre-update confirmation.",
		dismissible: true,
	},
} satisfies Record<string, DesktopNotice>;

const PREVIEW_KEYWORDS = ["notice", "popup", "dev", "preview", "test"];

function cycleTheme(): void {
	const current = useThemeStore.getState().activeThemeId;
	const next =
		current === "light"
			? "dark"
			: current === "dark"
				? SYSTEM_THEME_ID
				: "light";
	useThemeStore.getState().setTheme(next);
}

async function toggleNotificationSoundsMuted(
	currentlyMuted: boolean,
): Promise<void> {
	await electronTrpcClient.settings.setNotificationSoundsMuted.mutate({
		muted: !currentlyMuted,
	});
	await electronQueryClient.invalidateQueries({
		queryKey: [["settings", "getNotificationSoundsMuted"]],
	});
}

export const actionsProvider: CommandProvider = {
	id: "actions",
	provide: (context) => {
		const commands: Command[] = [
			{
				id: "actions.toggleTheme",
				title: msg({
					message: "Toggle theme",
				}),
				section: "actions",
				icon: PaletteIcon,
				keywords: ["dark", "light", "appearance", "color"],
				run: () => cycleTheme(),
				renderFrame: () => <ThemeFrame />,
			},
			{
				id: "actions.toggleNotificationSounds",
				title: context.notificationSoundsMuted
					? msg({
							message: "Unmute notifications",
						})
					: msg({
							message: "Mute notifications",
						}),
				section: "actions",
				icon: context.notificationSoundsMuted ? BellIcon : BellOffIcon,
				keywords: ["dnd", "silence", "notifications", "ringtone"],
				run: () =>
					toggleNotificationSoundsMuted(context.notificationSoundsMuted),
			},
			openUsageCommand,
			checkResourcesCommand,
			{
				id: "actions.toggleLeftSidebar",
				title: msg({
					message: "Toggle left sidebar",
				}),
				section: "actions",
				icon: PanelLeftIcon,
				hotkeyId: "TOGGLE_WORKSPACE_SIDEBAR",
				run: () => useWorkspaceSidebarStore.getState().toggleOpen(),
			},
		];

		if (context.workspace) {
			commands.push({
				id: "actions.toggleRightSidebar",
				title: msg({
					message: "Toggle right sidebar",
				}),
				section: "actions",
				icon: PanelRightIcon,
				hotkeyId: "TOGGLE_SIDEBAR",
				run: () => useRightSidebarToggleIntent.getState().request(),
			});
		}

		commands.push(
			{
				id: "actions.showShortcuts",
				title: msg({
					message: "Show keyboard shortcuts",
				}),
				section: "actions",
				icon: KeyboardIcon,
				hotkeyId: "SHOW_HOTKEYS",
				keywords: ["hotkeys"],
				run: (ctx) => ctx.navigate("/settings/keyboard"),
			},
			{
				id: "actions.checkUpdates",
				title: msg({
					message: "Check for updates",
				}),
				section: "actions",
				icon: RefreshCwIcon,
				keywords: ["update", "upgrade"],
				run: async () => {
					try {
						await electronTrpcClient.autoUpdate.checkInteractive.mutate();
					} catch (error) {
						const message = errorMessage(error);
						toast.error(
							i18n._({
								...msg({
									message: "Failed to check for updates: {message}",
								}),
								values: { message },
							}),
						);
					}
				},
			},
			{
				id: "actions.newWindow",
				title: msg({
					message: "New window",
				}),
				section: "actions",
				icon: AppWindowIcon,
				keywords: ["open", "multi"],
				run: async () => {
					try {
						await electronTrpcClient.window.openNew.mutate();
					} catch (error) {
						const message = errorMessage(error);
						toast.error(
							i18n._({
								...msg({
									message: "Failed to open new window: {message}",
								}),
								values: { message },
							}),
						);
					}
				},
			},
		);

		if (env.NODE_ENV === "development") {
			const { setPreview } = useDesktopNoticePreviewStore.getState();
			commands.push(
				{
					id: "dev.simulateUpdateDownloading",
					title: msg({
						message: "Simulate update: downloading",
					}),
					section: "dev",
					icon: DownloadIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateDownloading.mutate();
					},
				},
				{
					id: "dev.simulateUpdateReady",
					title: msg({
						message: "Simulate update: ready",
					}),
					section: "dev",
					icon: CircleCheckIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateReady.mutate();
					},
				},
				{
					id: "dev.simulateUpdateError",
					title: msg({
						message: "Simulate update: error",
					}),
					section: "dev",
					icon: TriangleAlertIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateError.mutate();
					},
				},
				{
					id: "dev.previewNoticeInfo",
					title: msg({ message: "Preview notice: info" }),
					section: "dev",
					icon: InfoIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.info),
				},
				{
					id: "dev.previewNoticeWarning",
					title: msg({
						message: "Preview notice: warning",
					}),
					section: "dev",
					icon: TriangleAlertIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.warning),
				},
				{
					id: "dev.previewNoticeBlocking",
					title: msg({
						message: "Preview notice: blocking (update required)",
					}),
					section: "dev",
					icon: OctagonAlertIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.blocking),
				},
				{
					id: "dev.previewNoticePostUpdate",
					title: msg({
						message: "Preview notice: post-update announcement",
					}),
					section: "dev",
					icon: MegaphoneIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.postUpdate),
				},
				{
					id: "dev.previewNoticePreUpdate",
					title: msg({
						message: "Preview notice: pre-update confirm",
					}),
					section: "dev",
					icon: DownloadIcon,
					keywords: PREVIEW_KEYWORDS,
					run: async () => {
						setPreview(PREVIEW_NOTICES.preUpdate);
						// the popover is anchored to the update pill, which only shows
						// when an update is ready — simulate that, then prompt the click.
						await electronTrpcClient.autoUpdate.simulateReady.mutate();
						toast.info(
							"Click the “↑ update” pill to see the pre-update confirm",
						);
					},
				},
				{
					id: "dev.clearNoticePreview",
					title: msg({ message: "Clear notice preview" }),
					section: "dev",
					icon: XIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(null),
				},
				{
					id: "dev.previewStarNagToast",
					title: msg({
						message: "Preview: GitHub star nag toast",
					}),
					section: "dev",
					icon: StarIcon,
					keywords: ["star", "github", "nag", "dev", "preview", "test"],
					// A dynamic import here would only defer this file's own module —
					// AnimatedStarButton (and framer-motion) is already statically
					// imported by useStarNagCard, which DashboardSidebar/WorkspaceSidebar
					// import unconditionally, so it's already in the eager bundle.
					run: () => previewStarNagOnboardingToast(),
				},
				{
					id: "dev.resetStarNagState",
					title: msg({
						message: "Reset GitHub star nag state",
					}),
					section: "dev",
					icon: RefreshCwIcon,
					keywords: ["star", "github", "nag", "dev", "reset", "test"],
					run: () => {
						const threshold =
							useStarNagStore.getState().nextThreshold ||
							STAR_NAG_INITIAL_THRESHOLD;
						useStarNagStore.setState({
							completed: false,
							completedAt: null,
							workspacesCreatedSinceBaseline: threshold,
							nextThreshold: threshold,
							deferredUntil: null,
						});
						toast.info(
							"Star nag reset — eligible again on the empty state, sidebar card, and onboarding toast",
						);
					},
				},
			);
		}

		return commands;
	},
};
