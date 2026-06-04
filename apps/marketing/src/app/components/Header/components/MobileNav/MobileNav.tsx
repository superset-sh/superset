"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
	type NavLink,
	PRODUCT_LINKS,
	RESOURCE_LINKS,
	TOP_LEVEL_LINKS,
} from "../../constants";

interface MobileNavProps {
	ctaButtons: React.ReactNode;
	starCounter?: React.ReactNode;
}

export function MobileNav({ ctaButtons, starCounter }: MobileNavProps) {
	const [isOpen, setIsOpen] = useState(false);
	const close = () => setIsOpen(false);

	return (
		<div className="md:hidden">
			<button
				type="button"
				className="p-2 text-muted-foreground hover:text-foreground transition-colors"
				onClick={() => setIsOpen((prev) => !prev)}
				aria-label={isOpen ? "Close menu" : "Open menu"}
				aria-expanded={isOpen}
			>
				{isOpen ? <X className="size-5" /> : <Menu className="size-5" />}
			</button>

			<AnimatePresence>
				{isOpen && (
					<motion.div
						className="absolute inset-x-0 top-14 border-t border-border bg-background/95 backdrop-blur-sm"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.2 }}
					>
						<div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col gap-6">
							<MobileSection
								title="Product"
								links={PRODUCT_LINKS}
								onNavigate={close}
							/>
							<MobileSection
								title="Resources"
								links={RESOURCE_LINKS}
								onNavigate={close}
							/>
							<MobileSection links={TOP_LEVEL_LINKS} onNavigate={close} />
							<div className="pt-4 border-t border-border flex flex-col gap-3">
								{starCounter}
								{ctaButtons}
							</div>
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</div>
	);
}

function MobileSection({
	title,
	links,
	onNavigate,
}: {
	title?: string;
	links: NavLink[];
	onNavigate: () => void;
}) {
	return (
		<div className="flex flex-col gap-1">
			{title && (
				<p className="px-2 pb-1 text-xs uppercase tracking-wide text-muted-foreground/70">
					{title}
				</p>
			)}
			{links.map((link) =>
				link.external ? (
					<a
						key={link.href}
						href={link.href}
						target="_blank"
						rel="noopener noreferrer"
						className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						{link.label}
					</a>
				) : (
					<Link
						key={link.href}
						href={link.href}
						onClick={onNavigate}
						className="px-2 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						{link.label}
					</Link>
				),
			)}
		</div>
	);
}
