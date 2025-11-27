"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useState } from "react";

const NAV_LINKS = [
	{ label: "Features", href: "#" },
	{ label: "Product", href: "#" },
	{ label: "Company", href: "#" },
	{ label: "Resources", href: "#" },
] as const;

export function Header() {
	const [isMenuOpen, setIsMenuOpen] = useState(false);

	return (
		<header className="fixed top-0 left-0 right-0 z-50 bg-black/80 backdrop-blur-lg border-b border-zinc-800/50">
			<nav className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
				<div className="flex items-center justify-between h-14 sm:h-16">
					{/* Logo */}
					<motion.a
						href="/"
						className="flex items-center gap-2 group"
						initial={{ opacity: 0, x: -20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.5 }}
					>
						<span className="text-white font-bold text-2xl group-hover:scale-110 transition-transform inline-block">
							⊇
						</span>
						<span className="text-white font-semibold text-lg hidden sm:block">
							Superset
						</span>
					</motion.a>

					{/* Desktop Navigation */}
					<motion.div
						className="hidden md:flex items-center gap-8"
						initial={{ opacity: 0, y: -10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.5, delay: 0.1 }}
					>
						{NAV_LINKS.map((link) => (
							<Link
								key={link.label}
								href={link.href}
								className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
							>
								{link.label}
							</Link>
						))}
					</motion.div>

					{/* CTA Button */}
					<motion.div
						className="hidden md:flex items-center gap-4"
						initial={{ opacity: 0, x: 20 }}
						animate={{ opacity: 1, x: 0 }}
						transition={{ duration: 0.5, delay: 0.2 }}
					>
						<Link
							href="#"
							className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
						>
							Sign in
						</Link>
						<Link
							href="#"
							className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors"
						>
							Get started
						</Link>
					</motion.div>

					{/* Mobile Menu Button */}
					<button
						type="button"
						className="md:hidden text-white p-2"
						onClick={() => setIsMenuOpen(!isMenuOpen)}
						aria-label="Toggle menu"
					>
						<svg
							className="w-6 h-6"
							fill="none"
							strokeLinecap="round"
							strokeLinejoin="round"
							strokeWidth="2"
							viewBox="0 0 24 24"
							stroke="currentColor"
							aria-hidden="true"
						>
							{isMenuOpen ? (
								<path d="M6 18L18 6M6 6l12 12" />
							) : (
								<path d="M4 6h16M4 12h16M4 18h16" />
							)}
						</svg>
					</button>
				</div>

				{/* Mobile Menu */}
				{isMenuOpen && (
					<motion.div
						className="md:hidden py-4 border-t border-zinc-800"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: "auto" }}
						exit={{ opacity: 0, height: 0 }}
						transition={{ duration: 0.3 }}
					>
						<div className="flex flex-col gap-4">
							{NAV_LINKS.map((link) => (
								<Link
									key={link.label}
									href={link.href}
									className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
									onClick={() => setIsMenuOpen(false)}
								>
									{link.label}
								</Link>
							))}
							<div className="pt-4 border-t border-zinc-800 flex flex-col gap-3">
								<Link
									href="#"
									className="text-zinc-400 hover:text-white transition-colors text-sm font-medium"
								>
									Sign in
								</Link>
								<Link
									href="#"
									className="bg-white text-black px-4 py-2 rounded-lg text-sm font-medium hover:bg-zinc-200 transition-colors text-center"
								>
									Get started
								</Link>
							</div>
						</div>
					</motion.div>
				)}
			</nav>
		</header>
	);
}
