import { useLingui } from "@lingui/react/macro";
import {
	type PagePresenceViewer,
	presenceColor,
} from "@superset/shared/page-presence";
import { openPagePresence } from "@superset/shared/page-presence-client";
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { PresenceAvatars } from "./components/PresenceAvatars";

export function PagePresence({ url }: { url: () => Promise<string | null> }) {
	const { t } = useLingui();
	const [viewers, setViewers] = useState<PagePresenceViewer[]>([]);
	const urlRef = useRef(url);
	urlRef.current = url;

	useEffect(() => {
		const client = openPagePresence({
			url: () => urlRef.current(),
			onViewers: setViewers,
		});
		const subscription = AppState.addEventListener("change", (state) => {
			if (state === "active") client.wake();
		});
		return () => {
			subscription.remove();
			client.stop();
		};
	}, []);

	const seen = new Set<string>();
	const people = viewers.flatMap((viewer) => {
		if (seen.has(viewer.key)) return [];
		seen.add(viewer.key);
		const number = viewer.guestNumber;
		return [
			{
				id: viewer.key,
				name:
					!viewer.guest && viewer.name
						? viewer.name
						: number
							? t({ message: `Guest ${number}` })
							: t({ message: "Guest" }),
				image: viewer.image,
				color: presenceColor(viewer.color),
			},
		];
	});

	return people.length > 0 ? <PresenceAvatars people={people} /> : null;
}
