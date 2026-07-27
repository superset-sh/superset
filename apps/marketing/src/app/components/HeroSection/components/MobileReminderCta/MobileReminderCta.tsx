"use client";

import { useState } from "react";
import { HiMiniBellAlert } from "react-icons/hi2";
import { track } from "@/lib/analytics";
import { ReminderModal } from "./components/ReminderModal";

export function MobileReminderCta() {
	const [isOpen, setIsOpen] = useState(false);

	return (
		<>
			<button
				type="button"
				className="bg-foreground text-background px-3 sm:px-6 py-2 sm:py-3 text-sm sm:text-base font-normal hover:opacity-90 transition-opacity flex items-center gap-2 whitespace-nowrap shrink-0"
				onClick={() => {
					track("mobile_hero_cta_clicked", { variant: "test" });
					setIsOpen(true);
				}}
			>
				Remind me on desktop
				<HiMiniBellAlert className="size-4" />
			</button>
			<ReminderModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
		</>
	);
}
