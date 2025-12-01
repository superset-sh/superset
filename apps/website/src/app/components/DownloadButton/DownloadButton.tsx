"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import { HiMiniArrowDownTray } from "react-icons/hi2";
import { DOWNLOAD_URL_MAC_ARM64 } from "@/constants";

interface DownloadButtonProps {
	size?: "sm" | "md";
	className?: string;
	onJoinWindowsWaitlist?: () => void;
}

export function DownloadButton({
	size = "md",
	className = "",
	onJoinWindowsWaitlist,
}: DownloadButtonProps) {
	const sizeClasses =
		size === "sm" ? "px-4 py-2 text-sm" : "px-6 py-3 text-base";

	const handleAppleSiliconDownload = () => {
		window.open(DOWNLOAD_URL_MAC_ARM64, "_blank");
	};

	const handleIntelDownload = () => {
		// TODO: Add actual download link for Intel-based Macs
		console.log("Downloading for Intel-based Macs");
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={`bg-white text-black ${sizeClasses} rounded-lg font-medium hover:bg-zinc-200 transition-colors flex items-center gap-2 ${className}`}
				>
					Download
					<HiMiniArrowDownTray className="size-4" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-80 bg-white border border-zinc-200 rounded-lg shadow-lg p-2"
			>
				{/* Download for Apple Silicon Macs */}
				<DropdownMenuItem
					onClick={handleAppleSiliconDownload}
					className="p-0 focus:bg-transparent"
				>
					<button
						type="button"
						className="w-full bg-zinc-900 text-white rounded-lg px-4 py-3 flex items-center justify-between hover:bg-zinc-800 transition-colors gap-4"
					>
						<div className="flex items-center gap-3">
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="currentColor"
								xmlns="http://www.w3.org/2000/svg"
								aria-label="Apple logo"
							>
								<title>Apple logo</title>
								<path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
							</svg>
							<span className="font-medium">Download for Mac</span>
						</div>
						<span className="text-xs text-zinc-400">APPLE SILICON</span>
					</button>
				</DropdownMenuItem>

				{/* Join Windows Waitlist */}
				<DropdownMenuItem
					onClick={onJoinWindowsWaitlist}
					className="p-0 mt-2 focus:bg-transparent"
				>
					<button
						type="button"
						className="w-full bg-zinc-100 text-black rounded-lg px-4 py-3 flex items-center hover:bg-zinc-200 transition-colors"
					>
						<div className="flex items-center gap-3">
							<svg
								width="20"
								height="20"
								viewBox="0 0 24 24"
								fill="currentColor"
								xmlns="http://www.w3.org/2000/svg"
								aria-label="Windows logo"
							>
								<title>Windows logo</title>
								<path d="M3 12V6.75l6-1.32v6.48L3 12zm17-9v8.75l-10 .15V5.21L20 3zM3 13l6 .09v6.81l-6-1.15V13zm17 .25V22l-10-1.8v-7.55l10 .15z" />
							</svg>
							<span className="font-medium">Join Windows waitlist</span>
						</div>
					</button>
				</DropdownMenuItem>

				<DropdownMenuSeparator className="my-2 bg-zinc-200 hidden" />

				{/* Download for Intel-based Macs */}
				<DropdownMenuItem
					onClick={handleIntelDownload}
					className="p-0 focus:bg-transparent hidden"
				>
					<div className="w-full px-2 py-2">
						<p className="text-sm text-zinc-500 mb-1">
							Mac older than November 2020?
						</p>
						<button
							type="button"
							className="text-sm text-black font-medium hover:text-zinc-700 transition-colors"
						>
							Download for Intel-based Macs
						</button>
					</div>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
