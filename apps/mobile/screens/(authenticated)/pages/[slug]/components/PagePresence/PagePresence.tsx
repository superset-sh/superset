import { useLingui } from "@lingui/react/macro";
import type {
	FrameMessage,
	HostMessageBody,
} from "@superset/shared/page-comments-runtime";
import {
	cursorPointsFrom,
	type PageCursorPoint,
	type PagePresenceViewer,
	presenceColor,
} from "@superset/shared/page-presence";
import {
	openPagePresence,
	type PagePresenceState,
} from "@superset/shared/page-presence-client";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { AppState, View } from "react-native";
import { PresenceAvatars } from "./components/PresenceAvatars";
import { PresenceCursor } from "./components/PresenceCursor";

export interface PagePresenceHandle {
	receive: (message: FrameMessage) => void;
	retrack: () => void;
}

interface PagePresenceProps {
	insetTop: number;
	url: () => Promise<string | null>;
	send: (message: HostMessageBody) => void;
}

const EMPTY: PagePresenceState = { viewers: [], cursors: new Map() };

export const PagePresence = forwardRef<PagePresenceHandle, PagePresenceProps>(
	function PagePresence({ insetTop, url, send }, ref) {
		const { t } = useLingui();
		const [state, setState] = useState<PagePresenceState>(EMPTY);
		const [points, setPoints] = useState<PageCursorPoint[]>([]);
		const urlRef = useRef(url);
		urlRef.current = url;

		useEffect(() => {
			const client = openPagePresence({
				url: () => urlRef.current(),
				onChange: setState,
			});
			const subscription = AppState.addEventListener("change", (next) => {
				if (next === "active") client.wake();
			});
			return () => {
				subscription.remove();
				client.stop();
			};
		}, []);

		const retrack = useCallback(() => {
			const present = new Set(state.viewers.map((viewer) => viewer.id));
			send({
				type: "track-cursors",
				cursors: [...state.cursors]
					.filter(([id]) => present.has(id))
					.map(([id, cursor]) => ({ id, ...cursor })),
			});
		}, [state, send]);

		useEffect(() => {
			retrack();
		}, [retrack]);

		useImperativeHandle(ref, () => ({
			receive: (message) => {
				if (message.type === "cursor-points") {
					setPoints(cursorPointsFrom(message.points));
				}
			},
			retrack,
		}));

		const nameOf = (viewer: PagePresenceViewer) => {
			const number = viewer.guestNumber;
			if (!viewer.guest && viewer.name) return viewer.name;
			return number
				? t({ message: `Guest ${number}` })
				: t({ message: "Guest" });
		};
		const byId = new Map(state.viewers.map((viewer) => [viewer.id, viewer]));

		const seen = new Set<string>();
		const people = state.viewers.flatMap((viewer) => {
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
					{points.map((point) => {
						const viewer = byId.get(point.id);
						if (!viewer) return null;
						return (
							<PresenceCursor
								key={point.id}
								x={point.x}
								y={point.y}
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
