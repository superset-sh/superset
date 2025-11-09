"use client";

import { useEffect } from "react";

interface WaitlistModalProps {
	isOpen: boolean;
	onClose: () => void;
}

export function WaitlistModal({ isOpen, onClose }: WaitlistModalProps) {
	useEffect(() => {
		// Prevent body scroll when modal is open
		if (isOpen) {
			document.body.style.overflow = "hidden";
		} else {
			document.body.style.overflow = "unset";
		}

		return () => {
			document.body.style.overflow = "unset";
		};
	}, [isOpen]);

	if (!isOpen) return null;

	return (
		<>
			{/* Backdrop */}
			<div
				className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
				onClick={onClose}
			/>

			{/* Modal Container with overflow hidden */}
			<div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
				<div className="pointer-events-auto w-full max-w-md mx-4 bg-black rounded-2xl shadow-2xl border border-zinc-800 overflow-hidden">
					{/* Close button */}
					<button
						type="button"
						onClick={onClose}
						className="absolute top-4 right-4 z-10 text-zinc-400 hover:text-white transition-colors"
						aria-label="Close modal"
					>
						<svg
							width="24"
							height="24"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="18" y1="6" x2="6" y2="18" />
							<line x1="6" y1="6" x2="18" y2="18" />
						</svg>
					</button>

					{/* Iframe container with fixed height to cut off branding */}
					<div className="w-full h-[500px] overflow-hidden">
						<iframe
							src="https://tally.so/r/wv7Q0A"
							width="100%"
							height="650"
							frameBorder="0"
							marginHeight={0}
							marginWidth={0}
							title="Superset Waitlist"
							className="w-full"
						/>
					</div>
				</div>
			</div>
		</>
	);
}
