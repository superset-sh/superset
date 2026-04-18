"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DownloadButton } from "../DownloadButton";
import { WaitlistModal } from "../WaitlistModal";

interface HeaderCTAProps {
	isLoggedIn: boolean;
	dashboardUrl: string;
}

export function HeaderCTA({ isLoggedIn, dashboardUrl }: HeaderCTAProps) {
	const [isWaitlistOpen, setIsWaitlistOpen] = useState(false);
	const portalRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		portalRef.current = document.body;
	}, []);

	const dashboardLink = isLoggedIn && (
		<a
			href={dashboardUrl}
			className="px-4 py-2 text-sm font-normal text-muted-foreground hover:text-foreground transition-colors text-center"
		>
			Dashboard
		</a>
	);

	const waitlistModal = portalRef.current
		? createPortal(
				<WaitlistModal
					isOpen={isWaitlistOpen}
					onClose={() => setIsWaitlistOpen(false)}
				/>,
				portalRef.current,
			)
		: null;

	return (
		<>
			{dashboardLink}
			<DownloadButton
				size="sm"
				onJoinWaitlist={() => setIsWaitlistOpen(true)}
			/>
			{waitlistModal}
		</>
	);
}
