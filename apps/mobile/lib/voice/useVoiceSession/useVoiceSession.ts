import { useQueryClient } from "@tanstack/react-query";
import { randomUUID } from "expo-crypto";
import { router, usePathname } from "expo-router";
import { useCallback, useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/client";
import { onRealtimeNudge } from "@/lib/realtime/nudgeBus";
import { apiClient } from "@/lib/trpc/client";
import { VoiceSessionController } from "../session/VoiceSessionController";
import { createVoiceData } from "../tools/data";
import { WebRtcTransport } from "../transport/WebRtcTransport";
import { useVoiceLevelsStore } from "../voiceLevelsStore";
import { isVoiceActive, useVoiceStore } from "../voiceStore";

/** One session at a time, shared by the layer, the pill, and whatever starts it. */
let current: VoiceSessionController | null = null;
/** Who the running session acts as; a different user or organization ends it. */
let currentOwner: string | null = null;
let currentPathname = "/";
// A push issued while a sheet is still animating out lands inside the sheet.
const SHEET_DISMISS_MS = 450;
let sheetDismissedAt = 0;

export interface VoiceSessionHandle {
	start: () => Promise<void>;
	end: () => void;
	toggleMute: () => void;
	interrupt: () => void;
	applyLiveSettings: () => void;
	restart: () => void;
	sayText: (text: string) => void;
	setMuted: (muted: boolean) => void;
}

export function useVoiceSession(): VoiceSessionHandle {
	const queryClient = useQueryClient();
	const { data: session } = useSession();
	const organizationId = session?.session?.activeOrganizationId ?? null;
	const userId = session?.user.id ?? null;
	const pathname = usePathname();
	const pathnameRef = useRef(pathname);
	pathnameRef.current = pathname;
	currentPathname = pathname;

	useEffect(() => {
		current?.noteScreen(pathname);
	}, [pathname]);

	const start = useCallback(async () => {
		if (!organizationId || !userId) return;
		if (current && isVoiceActive(useVoiceStore.getState().status)) {
			return;
		}
		const controller = new VoiceSessionController({
			store: useVoiceStore,
			levels: useVoiceLevelsStore,
			data: createVoiceData({ organizationId, userId, queryClient }),
			mint: () => {
				const { voice, reasoningEffort, speed } = useVoiceStore.getState();
				return apiClient.voice.createSession.mutate({
					voice,
					reasoningEffort,
					speed,
				});
			},
			createTransport: () => new WebRtcTransport(),
			router: {
				push: (href) => {
					const wait = sheetDismissedAt + SHEET_DISMISS_MS - Date.now();
					if (wait > 0) setTimeout(() => router.push(href as never), wait);
					else router.push(href as never);
				},
				dismissTo: (href) => router.dismissTo(href as never),
				setParams: (params) => router.setParams(params as never),
				dismiss: () => {
					sheetDismissedAt = Date.now();
					router.dismiss();
				},
			},
			getPathname: () => currentPathname,
			onRealtimeNudge,
			newId: randomUUID,
			now: Date.now,
		});
		current = controller;
		currentOwner = `${userId}:${organizationId}`;
		await controller.start();
	}, [organizationId, userId, queryClient]);

	const end = useCallback(() => {
		current?.end();
		current = null;
		currentOwner = null;
	}, []);

	useEffect(() => {
		if (!current || currentOwner === `${userId}:${organizationId}`) return;
		end();
		useVoiceStore.getState().reset();
	}, [userId, organizationId, end]);

	const toggleMute = useCallback(() => {
		current?.setMuted(!useVoiceStore.getState().muted);
	}, []);

	const interrupt = useCallback(() => current?.interrupt(), []);

	const applyLiveSettings = useCallback(() => current?.applyLiveSettings(), []);
	const restart = useCallback(() => void current?.restart(), []);
	const setMuted = useCallback(
		(muted: boolean) => current?.setMuted(muted),
		[],
	);
	const sayText = useCallback((text: string) => current?.sayText(text), []);

	return {
		start,
		end,
		toggleMute,
		interrupt,
		applyLiveSettings,
		restart,
		sayText,
		setMuted,
	};
}
