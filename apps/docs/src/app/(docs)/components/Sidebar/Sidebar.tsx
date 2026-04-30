"use client";

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useSearchContext } from "fumadocs-ui/contexts/search";
import { Check, ChevronDownIcon, ChevronsUpDown, Search } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AsideLink } from "@/components/AsideLink";
import { cn } from "@/lib/cn";
import { getActiveProductId, products } from "./components/SidebarContent";

export default function Sidebar() {
	const pathname = usePathname();
	const activeProductId = useMemo(
		() => getActiveProductId(pathname),
		[pathname],
	);
	const activeProduct = useMemo(
		() => products.find((p) => p.id === activeProductId) ?? products[0],
		[activeProductId],
	);
	const sections = activeProduct?.sections ?? [];

	const [productMenuOpen, setProductMenuOpen] = useState(false);
	const [openSections, setOpenSections] = useState<number[]>(() =>
		Array.from({ length: sections.length }, (_, i) => i),
	);

	const { setOpenSearch } = useSearchContext();

	useEffect(() => {
		setOpenSections(Array.from({ length: sections.length }, (_, i) => i));
	}, [sections.length]);

	useEffect(() => {
		const currentSection = sections.findIndex((section) =>
			section.items.some((item) => item.href === pathname),
		);
		if (currentSection !== -1) {
			setOpenSections((prev) =>
				prev.includes(currentSection) ? prev : [...prev, currentSection],
			);
		}
	}, [pathname, sections]);

	useEffect(() => {
		if (!productMenuOpen) return;
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") setProductMenuOpen(false);
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [productMenuOpen]);

	const toggleSection = (index: number) => {
		setOpenSections((prev) =>
			prev.includes(index) ? prev.filter((i) => i !== index) : [...prev, index],
		);
	};

	if (!activeProduct) return null;

	const ActiveIcon = activeProduct.Icon;

	return (
		<div className={cn("fixed start-0 top-0")}>
			<aside
				className={cn(
					"navbar:transition-all",
					"border-r border-border top-[55px] navbar:flex hidden navbar:w-[268px] lg:w-[286px]! overflow-y-auto absolute h-[calc(100dvh-55px)] pb-2 flex-col justify-between w-[var(--fd-sidebar-width)]",
				)}
			>
				<div>
					<div className="relative border-b dark:bg-zinc-950 dark:border-t-zinc-900/30 dark:border-t">
						<button
							type="button"
							className="flex w-full items-center gap-2 px-5 py-3 text-foreground"
							onClick={() => setProductMenuOpen((open) => !open)}
							aria-expanded={productMenuOpen}
							aria-haspopup="listbox"
						>
							<ActiveIcon className="size-4" />
							<span className="text-sm font-medium grow text-left">
								{activeProduct.title}
							</span>
							<ChevronsUpDown className="size-4 text-muted-foreground" />
						</button>
						<AnimatePresence>
							{productMenuOpen && (
								<>
									<button
										type="button"
										aria-label="Close product menu"
										className="fixed inset-0 z-40 cursor-default"
										onClick={() => setProductMenuOpen(false)}
									/>
									<motion.div
										initial={{ opacity: 0, y: -4 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -4 }}
										transition={{ duration: 0.12 }}
										className="absolute left-2 right-2 top-full z-50 mt-1 rounded-lg border border-border bg-background shadow-lg"
										role="listbox"
									>
										<div className="p-1.5 flex flex-col gap-0.5">
											{products.map((product) => {
												const ProductIcon = product.Icon;
												const isActive = product.id === activeProductId;
												return (
													<Link
														key={product.id}
														href={product.url}
														onClick={() => setProductMenuOpen(false)}
														className={cn(
															"flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
															isActive
																? "bg-primary/10 text-foreground"
																: "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
														)}
														role="option"
														aria-selected={isActive}
													>
														<ProductIcon className="size-4 shrink-0" />
														<div className="grow min-w-0">
															<div className="font-medium text-foreground truncate">
																{product.title}
															</div>
															<div className="text-xs text-muted-foreground truncate">
																{product.description}
															</div>
														</div>
														{isActive && (
															<Check className="size-4 shrink-0 text-muted-foreground" />
														)}
													</Link>
												);
											})}
										</div>
									</motion.div>
								</>
							)}
						</AnimatePresence>
					</div>

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
															className="min-w-0 pl-9 pr-4"
														>
															<span className="block truncate">
																{item.title}
															</span>
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
