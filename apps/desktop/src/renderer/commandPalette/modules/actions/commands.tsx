import type { DesktopNotice } from "@superset/shared/desktop-notices";
import { toast } from "@superset/ui/sonner";
import {
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
	TriangleAlertIcon,
	XIcon,
} from "lucide-react";
import { env } from "renderer/env.renderer";
import { electronTrpcClient } from "renderer/lib/trpc-client";
import { electronQueryClient } from "renderer/providers/ElectronTRPCProvider";
import { useDesktopNoticePreviewStore } from "renderer/stores/desktop-notice-preview";
import { useRightSidebarToggleIntent } from "renderer/stores/right-sidebar-toggle-intent";
import { SYSTEM_THEME_ID, useThemeStore } from "renderer/stores/theme/store";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";
import type { Command, CommandProvider } from "../../core/types";
import { ThemeFrame } from "../../ui/ThemeFrame/ThemeFrame";

/** Dev-only fake notices for previewing each surface via the command palette. */
const PREVIEW_NOTICES = {
	info: {
		id: "preview.info",
		severity: "info",
		trigger: "immediate",
		title: "New in this version",
		body: "This is a **preview** of an info notice. Markdown, [links](https://superset.sh), and images render here.",
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
		title: "Heads up: breaking changes ahead",
		body: "This is a **preview** of a warning notice about the next version.",
		cta: { label: "Update now", action: "install-update" },
		dismissible: true,
	},
	blocking: {
		id: "preview.blocking",
		severity: "blocking",
		trigger: "immediate",
		title: "Update required",
		body: "This is a preview of the blocking forced-update page. Press Esc to exit the preview.",
		cta: { label: "Install & restart", action: "install-update" },
		dismissible: false,
	},
	postUpdate: {
		id: "preview.post-update",
		severity: "info",
		trigger: "post-update",
		title: "What's new",
		body: "This is a **preview** of a post-update announcement.",
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
		title: "Before you update",
		body: "This is a **preview** of the pre-update confirmation.",
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
				title: "Toggle theme",
				section: "actions",
				icon: PaletteIcon,
				keywords: ["dark", "light", "appearance", "color"],
				run: () => cycleTheme(),
				renderFrame: () => <ThemeFrame />,
			},
			{
				id: "actions.toggleLeftSidebar",
				title: "Toggle left sidebar",
				section: "actions",
				icon: PanelLeftIcon,
				hotkeyId: "TOGGLE_WORKSPACE_SIDEBAR",
				run: () => useWorkspaceSidebarStore.getState().toggleOpen(),
			},
		];

		if (context.workspace) {
			commands.push({
				id: "actions.toggleRightSidebar",
				title: "Toggle right sidebar",
				section: "actions",
				icon: PanelRightIcon,
				hotkeyId: "TOGGLE_SIDEBAR",
				run: () => useRightSidebarToggleIntent.getState().request(),
			});
		}

		commands.push(
			{
				id: "actions.toggleNotificationSounds",
				title: context.notificationSoundsMuted
					? "Unmute notifications"
					: "Mute notifications",
				section: "actions",
				icon: context.notificationSoundsMuted ? BellIcon : BellOffIcon,
				keywords: ["dnd", "silence", "notifications", "ringtone"],
				run: () =>
					toggleNotificationSoundsMuted(context.notificationSoundsMuted),
			},
			{
				id: "actions.showShortcuts",
				title: "Show keyboard shortcuts",
				section: "actions",
				icon: KeyboardIcon,
				hotkeyId: "SHOW_HOTKEYS",
				keywords: ["hotkeys"],
				run: (ctx) => ctx.navigate("/settings/keyboard"),
			},
			{
				id: "actions.checkUpdates",
				title: "Check for updates",
				section: "actions",
				icon: RefreshCwIcon,
				keywords: ["update", "upgrade"],
				run: async () => {
					try {
						await electronTrpcClient.autoUpdate.checkInteractive.mutate();
					} catch (error) {
						const message =
							error instanceof Error ? error.message : String(error);
						toast.error(`Failed to check for updates: ${message}`);
					}
				},
			},
		);

		if (env.NODE_ENV === "development") {
			const { setPreview } = useDesktopNoticePreviewStore.getState();
			commands.push(
				{
					id: "dev.simulateUpdateDownloading",
					title: "Simulate update: downloading",
					section: "dev",
					icon: DownloadIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateDownloading.mutate();
					},
				},
				{
					id: "dev.simulateUpdateReady",
					title: "Simulate update: ready",
					section: "dev",
					icon: CircleCheckIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateReady.mutate();
					},
				},
				{
					id: "dev.simulateUpdateError",
					title: "Simulate update: error",
					section: "dev",
					icon: TriangleAlertIcon,
					keywords: ["update", "dev", "simulate", "test"],
					run: async () => {
						await electronTrpcClient.autoUpdate.simulateError.mutate();
					},
				},
				{
					id: "dev.previewNoticeInfo",
					title: "Preview notice: info",
					section: "dev",
					icon: InfoIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.info),
				},
				{
					id: "dev.previewNoticeWarning",
					title: "Preview notice: warning",
					section: "dev",
					icon: TriangleAlertIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.warning),
				},
				{
					id: "dev.previewNoticeBlocking",
					title: "Preview notice: blocking (update required)",
					section: "dev",
					icon: OctagonAlertIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.blocking),
				},
				{
					id: "dev.previewNoticePostUpdate",
					title: "Preview notice: post-update announcement",
					section: "dev",
					icon: MegaphoneIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(PREVIEW_NOTICES.postUpdate),
				},
				{
					id: "dev.previewNoticePreUpdate",
					title: "Preview notice: pre-update confirm",
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
					title: "Clear notice preview",
					section: "dev",
					icon: XIcon,
					keywords: PREVIEW_KEYWORDS,
					run: () => setPreview(null),
				},
			);
		}

		return commands;
	},
};
