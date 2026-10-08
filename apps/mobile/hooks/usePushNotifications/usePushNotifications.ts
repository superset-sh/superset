import * as Notifications from "expo-notifications";
import { type Href, usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { useSession } from "@/lib/auth/client";
import {
	agentEventHref,
	agentEventTarget,
	isViewingWorkspace,
	registerForPush,
} from "@/lib/push";

export function usePushNotifications() {
	const { data: session } = useSession();
	const router = useRouter();
	const pathname = usePathname();
	const pathnameRef = useRef(pathname);
	pathnameRef.current = pathname;
	const lastResponse = Notifications.useLastNotificationResponse();

	const userId = session?.user.id;
	const paid = !!session?.session.plan;

	useEffect(() => {
		if (!userId || !paid) return;
		registerForPush().catch((error) => {
			console.warn("[push] failed to register this device:", error);
		});
	}, [userId, paid]);

	useEffect(() => {
		Notifications.setNotificationHandler({
			handleNotification: async (notification) => {
				const target = agentEventTarget(notification.request.content.data);
				const show = !(
					target && isViewingWorkspace(pathnameRef.current, target)
				);
				return {
					shouldShowBanner: show,
					shouldShowList: show,
					shouldPlaySound: show,
					shouldSetBadge: false,
				};
			},
		});
		return () => Notifications.setNotificationHandler(null);
	}, []);

	useEffect(() => {
		if (!lastResponse || !userId) return;
		const target = agentEventTarget(
			lastResponse.notification.request.content.data,
		);
		Notifications.clearLastNotificationResponse();
		if (target) router.push(agentEventHref(target) as Href);
	}, [lastResponse, userId, router]);
}
