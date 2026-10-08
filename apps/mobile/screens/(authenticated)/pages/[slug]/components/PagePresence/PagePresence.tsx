import { useLingui } from "@lingui/react/macro";
import {
	cursorPointsFrom,
	type PageCursorPoint,
	type PagePresenceViewer,
	presenceColor,
} from "@superset/shared/page-presence";
import { openPresenceWatch } from "@superset/shared/page-presence-watch";
import type { PageStorageFrameMessage } from "@superset/shared/page-storage";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { AppState, View } from "react-native";
import { PresenceAvatars } from "./components/PresenceAvatars";
import { PresenceCursor } from "./components/PresenceCursor";

export interface PagePresenceHandle {
	receive: (message: PageStorageFrameMessage) => void;
}

interface PagePresenceProps {
	insetTop: number;
	watchTicket?: () => Promise<string | null>;
}

export const PagePresence = forwardRef<PagePresenceHandle, PagePresenceProps>(
	function PagePresence({ insetTop, watchTicket }, ref) {
		const { t } = useLingui();
		const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
		const [cursors, setCursors] = useState<PageCursorPoint[]>([]);
		const watchTicketRef = useRef(watchTicket);
		watchTicketRef.current = watchTicket;
		const watching = Boolean(watchTicket);

		useEffect(() => {
			if (!watching) return;
			const watch = openPresenceWatch({
				url: async () => (await watchTicketRef.current?.()) ?? null,
				onViewers: setViewers,
			});
			const subscription = AppState.addEventListener("change", (state) => {
				if (state === "active") watch.wake();
			});
			return () => {
				subscription.remove();
				watch.stop();
				setViewers([]);
			};
		}, [watching]);

		useImperativeHandle(ref, () => ({
			receive: (message) => {
				if (message.type === "cursors") {
					setCursors(cursorPointsFrom(message.cursors));
				}
			},
		}));

		const nameOf = (viewer: PagePresenceViewer) => {
			const number = viewer.guestNumber;
			if (!viewer.guest && viewer.name) return viewer.name;
			return number
				? t({ message: `Guest ${number}` })
				: t({ message: "Guest" });
		};
		const byId = new Map(viewers.map((viewer) => [viewer.id, viewer]));

		const seen = new Set<string>();
		const people = viewers.flatMap((viewer) => {
			if (seen.has(viewer.userId)) return [];
			seen.add(viewer.userId);
			return [
				{
					id: viewer.userId,
					name: nameOf(viewer),
					image: viewer.image,
					color: presenceColor(viewer.userId),
				},
			];
		});

		return (
			<>
				<View
					pointerEvents="none"
					className="absolute inset-x-0 bottom-0 overflow-hidden"
					style={{ top: insetTop }}
				>
					{cursors.map((cursor) => {
						const viewer = byId.get(cursor.id);
						if (!viewer) return null;
						return (
							<PresenceCursor
								key={cursor.id}
								x={cursor.x}
								y={cursor.y}
								name={nameOf(viewer)}
								color={presenceColor(viewer.userId)}
							/>
						);
					})}
				</View>
				{people.length > 0 ? <PresenceAvatars people={people} /> : null}
			</>
		);
	},
);
