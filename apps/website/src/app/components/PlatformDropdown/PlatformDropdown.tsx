"use client";

import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@superset/ui/dropdown-menu";
import type { ReactNode } from "react";

export interface DropdownItem {
	id: string;
	label: string;
	description?: string;
	icon?: ReactNode;
	onClick: () => void;
	variant?: "primary" | "secondary";
}

export interface DropdownSection {
	title?: string;
	items: DropdownItem[];
}

interface PlatformDropdownProps {
	trigger: ReactNode;
	sections: DropdownSection[];
	align?: "start" | "end" | "center";
	className?: string;
}

export function PlatformDropdown({
	trigger,
	sections,
	align = "end",
	className = "",
}: PlatformDropdownProps) {
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
			<DropdownMenuContent
				align={align}
				className={`w-80 bg-white border border-zinc-200 rounded-[5px] shadow-lg p-2 ${className}`}
			>
				{sections.map((section, sectionIndex) => (
					<div key={section.title || sectionIndex}>
						{sectionIndex > 0 && (
							<div className="mt-2 pt-2 border-t border-zinc-200" />
						)}
						{section.title && (
							<p className="text-xs text-zinc-500 px-2 mb-2 text-start">
								{section.title}
							</p>
						)}
						<div className={section.title ? "flex flex-col gap-1.5" : ""}>
							{section.items.map((item) => (
								<DropdownMenuItem
									key={item.id}
									onClick={item.onClick}
									className="p-0 focus:bg-transparent"
								>
									{item.variant === "primary" ? (
										<button
											type="button"
											className="w-full bg-zinc-900 text-white rounded-[5px] px-4 py-3 flex items-center justify-between hover:bg-zinc-800 transition-colors gap-4"
										>
											<div className="flex items-center gap-3">
												{item.icon}
												<span className="font-medium">{item.label}</span>
											</div>
											{item.description && (
												<span className="text-xs text-zinc-400">
													{item.description}
												</span>
											)}
										</button>
									) : (
										<button
											type="button"
											className="w-full bg-zinc-50 text-black rounded-[5px] px-3 py-2 flex items-center gap-2 hover:bg-zinc-100 transition-colors text-sm"
										>
											{item.icon}
											<span>{item.label}</span>
										</button>
									)}
								</DropdownMenuItem>
							))}
						</div>
					</div>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
