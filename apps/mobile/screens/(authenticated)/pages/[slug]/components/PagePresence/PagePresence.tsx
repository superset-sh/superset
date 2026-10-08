import { useLingui } from "@lingui/react/macro";
import {
	cursorPointsFrom,
	type PageCursorPoint,
	type PagePresenceViewer,
	presenceColor,
	presenceViewersFrom,
} from "@superset/shared/page-presence";
import type { PageStorageFrameMessage } from "@superset/shared/page-storage";
import { forwardRef, useImperativeHandle, useState } from "react";
import { View } from "react-native";
import { PresenceAvatars } from "./components/PresenceAvatars";
import { PresenceCursor } from "./components/PresenceCursor";

export interface PagePresenceHandle {
	receive: (message: PageStorageFrameMessage) => void;
}

interface PagePresenceProps {
	insetTop: number;
}

export const PagePresence = forwardRef<PagePresenceHandle, PagePresenceProps>(
	function PagePresence({ insetTop }, ref) {
		const { t } = useLingui();
		const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
		const [cursors, setCursors] = useState<PageCursorPoint[]>([]);

		useImperativeHandle(ref, () => ({
			receive: (message) => {
				if (message.type === "presence") {
					setViewers(presenceViewersFrom(message.viewers));
				}
				if (message.type === "cursors") {
					setCursors(cursorPointsFrom(message.cursors));
				}
			},
		}));

		const guestName = t({ message: "Guest" });
		const nameOf = (viewer: PagePresenceViewer) =>
			viewer.guest || !viewer.name ? guestName : viewer.name;
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
