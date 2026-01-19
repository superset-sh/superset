"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { ChevronDownIcon, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AsideLink } from "@/components/AsideLink";
import { cn } from "@/lib/cn";
import { contents } from "./components/SidebarContent";

export default function Sidebar() {
	// Initialize with all sections open by default
	const [currentOpen, setCurrentOpen] = useState<number[]>(() =>
		Array.from({ length: contents.length }, (_, i) => i),
	);

	const { setOpenSearch } = useSearchContext();
	const pathname = usePathname();

	useEffect(() => {
		// Ensure the current section is open when pathname changes
		const defaultValue = contents.findIndex((item) =>
			item.list.some((listItem) => listItem.href === pathname),
		);
		const currentSection = defaultValue === -1 ? 0 : defaultValue;
		if (!currentOpen.includes(currentSection)) {
			setCurrentOpen((prev) => [...prev, currentSection]);
		}
	}, [pathname, currentOpen]);

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
						onClick={() => {
							setOpenSearch(true);
						}}
					>
						<Search className="size-4 mx-0.5" />
						<p className="text-sm">Search documentation...</p>
					</button>

					<MotionConfig
						transition={{ duration: 0.4, type: "spring", bounce: 0 }}
					>
						<div className="flex flex-col">
							{contents.map((item, index) => (
								<div key={item.title}>
									<button
										type="button"
										className="border-b w-full hover:underline border-border text-sm px-5 py-2.5 text-left flex items-center gap-2"
										onClick={() => {
											setCurrentOpen((prev) =>
												prev.includes(index)
													? prev.filter((i) => i !== index)
													: [...prev, index],
											);
										}}
									>
										<item.Icon style={{ width: "1.4em", height: "1.4em" }} />
										<span className="grow">{item.title}</span>
										<motion.div
											animate={{
												rotate: currentOpen.includes(index) ? 180 : 0,
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
										{currentOpen.includes(index) && (
											<motion.div
												initial={{ opacity: 0, height: 0 }}
												animate={{ opacity: 1, height: "auto" }}
												exit={{ opacity: 0, height: 0 }}
												className="relative overflow-hidden"
											>
												<motion.div className="text-sm">
													{item.list.map((listItem) => (
														<div key={listItem.title}>
															<Suspense
																fallback={
																	<div className="flex items-center gap-2 px-5 py-1.5 animate-pulse">
																		<div
																			className="size-4 shrink-0 bg-muted rounded-full"
																			aria-hidden="true"
																		/>
																		<div
																			className="h-3 bg-muted rounded-md"
																			style={{
																				width: `${Math.random() * (70 - 30) + 30}%`,
																			}}
																			aria-hidden="true"
																		/>
																		<span className="sr-only">Loading...</span>
																	</div>
																}
															>
																{listItem.separator ? (
																	<div className="flex flex-row items-center gap-2 mx-5 my-2">
																		<p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
																			{listItem.title}
																		</p>
																		<div className="flex-grow h-px bg-border" />
																	</div>
																) : listItem.group ? (
																	<div className="flex flex-row items-center gap-2 mx-5 my-1 ">
																		<p className="text-sm text-foreground font-medium">
																			{listItem.title}
																		</p>
																		<div className="flex-grow h-px bg-border" />
																	</div>
																) : (
																	<AsideLink
																		href={listItem.href}
																		startWith="/docs"
																		title={listItem.title}
																		className="break-words text-nowrap w-[--fd-sidebar-width]"
																	>
																		<div className="min-w-4">
																			<listItem.icon className="text-stone-950 dark:text-white" />
																		</div>
																		{listItem.title}
																	</AsideLink>
																)}
															</Suspense>
														</div>
													))}
												</motion.div>
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
