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
			className="px-4 py-2 font-mono text-xs uppercase tracking-wider text-center whitespace-nowrap border border-border text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
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
