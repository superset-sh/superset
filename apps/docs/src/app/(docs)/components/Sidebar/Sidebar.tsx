"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ChevronDownIcon, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AsideLink } from "@/components/AsideLink";
import { cn } from "@/lib/cn";
import { sections } from "./components/SidebarContent";

export default function Sidebar() {
	const [openSections, setOpenSections] = useState<number[]>(() =>
		Array.from({ length: sections.length }, (_, i) => i),
	);

	const { setOpenSearch } = useSearchContext();
	const pathname = usePathname();

	useEffect(() => {
		const currentSection = sections.findIndex((section) =>
			section.items.some((item) => item.href === pathname),
		);
		if (currentSection !== -1 && !openSections.includes(currentSection)) {
			setOpenSections((prev) => [...prev, currentSection]);
		}
	}, [pathname, openSections]);

	const toggleSection = (index: number) => {
		setOpenSections((prev) =>
			prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
		);
	};

	return (
		<div className={cn("fixed start-0 top-0")}>
			<aside
				className={cn(
					"navbar:transition-all",
					"border-r border-border top-[55px] navbar:flex hidden navbar:w-[268px] lg:w-[286px]! overflow-y-auto absolute h-[calc(100dvh-55px)] pb-2 flex-col justify-between w-[var(--fd-sidebar-width)]",
				)}
			>
				<div>
					<button
						type="button"
						className="flex w-full items-center gap-2 px-5 py-2.5 border-b text-muted-foreground dark:bg-zinc-950 dark:border-t-zinc-900/30 dark:border-t"
						onClick={() => setOpenSearch(true)}
					>
						<Search className="size-4 mx-0.5" />
						<p className="text-sm">Search documentation...</p>
					</button>

					<MotionConfig
						transition={{ duration: 0.4, type: "spring", bounce: 0 }}
					>
						<div className="flex flex-col">
							{sections.map((section, index) => (
								<div key={section.title}>
									<button
										type="button"
										className="border-b w-full hover:underline border-border text-sm px-5 py-2.5 text-left flex items-center gap-2"
										onClick={() => toggleSection(index)}
									>
										<section.Icon className="size-4" />
										<span className="grow">{section.title}</span>
										<motion.div
											animate={{
												rotate: openSections.includes(index) ? 180 : 0,
											}}
										>
											<ChevronDownIcon
												className={cn(
													"h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200",
												)}
											/>
										</motion.div>
									</button>
									<AnimatePresence initial={false}>
										{openSections.includes(index) && (
											<motion.div
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												exit={{ opacity: 0, height: 0 }}
												className="relative overflow-hidden"
											>
												<div className="text-sm">
													{section.items.map((item) => (
														<AsideLink
															key={item.href}
															href={item.href}
															startWith="/docs"
															title={item.title}
															className="break-words text-nowrap w-[--fd-sidebar-width] pl-9"
														>
															{item.title}
														</AsideLink>
													))}
												</div>
											</motion.div>
										)}
									</AnimatePresence>
								</div>
							))}
						</div>
					</MotionConfig>
				</div>
			</aside>
		</div>
	);
}
