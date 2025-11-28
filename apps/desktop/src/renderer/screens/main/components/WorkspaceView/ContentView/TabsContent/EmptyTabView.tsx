import { motion } from "framer-motion";
import {
	HiMiniCommandLine,
	HiMiniPlus,
	HiMiniSquares2X2,
	HiMiniWindow,
} from "react-icons/hi2";
import { trpc } from "renderer/lib/trpc";
import { useAddTab } from "renderer/stores";

const shortcuts = [
	{
		keys: ["⌘", "T"],
		label: "New terminal",
		icon: HiMiniPlus,
	},
	{
		keys: ["⌘", "D"],
		label: "Split view",
		icon: HiMiniSquares2X2,
	},
	{
		keys: ["⌘", "⌥", "←/→"],
		label: "Switch workspace",
		icon: HiMiniWindow,
	},
];

function ShortcutPill({
	keys,
	label,
	icon: Icon,
	delay,
}: {
	keys: string[];
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	delay: number;
}) {
	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay, duration: 0.4, ease: "easeOut" }}
			className="flex items-center gap-3 px-4 py-2.5 rounded-xl bg-muted/30 backdrop-blur-sm border border-border/50"
		>
			<Icon className="size-4 text-muted-foreground/70" />
			<div className="flex items-center gap-1.5">
				{keys.map((key) => (
					<kbd
						key={key}
						className="px-2 py-0.5 text-xs font-medium rounded-md bg-background/80 border border-border/60 text-foreground/80 shadow-sm"
					>
						{key}
					</kbd>
				))}
			</div>
			<span className="text-sm text-muted-foreground/80">{label}</span>
		</motion.div>
	);
}

function FloatingOrb({
	className,
	delay,
	duration,
}: {
	className: string;
	delay: number;
	duration: number;
}) {
	return (
		<motion.div
			className={`absolute rounded-full blur-3xl opacity-20 ${className}`}
			animate={{
				scale: [1, 1.2, 1],
				opacity: [0.15, 0.25, 0.15],
			}}
			transition={{
				duration,
				delay,
				repeat: Number.POSITIVE_INFINITY,
				ease: "easeInOut",
			}}
		/>
	);
}

export function EmptyTabView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const addTab = useAddTab();

	const handleNewTerminal = () => {
		if (activeWorkspace?.id) {
			addTab(activeWorkspace.id);
		}
	};

	return (
		<div className="flex-1 h-full overflow-hidden relative">
			{/* Ambient background orbs */}
			<FloatingOrb
				className="w-96 h-96 bg-chart-1 -top-20 -left-20"
				delay={0}
				duration={8}
			/>
			<FloatingOrb
				className="w-80 h-80 bg-chart-2 top-1/3 -right-10"
				delay={2}
				duration={10}
			/>
			<FloatingOrb
				className="w-72 h-72 bg-chart-4 -bottom-10 left-1/4"
				delay={4}
				duration={9}
			/>

			{/* Subtle grid pattern */}
			<div
				className="absolute inset-0 opacity-[0.02]"
				style={{
					backgroundImage: `
						linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
						linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
					`,
					backgroundSize: "60px 60px",
				}}
			/>

			{/* Content */}
			<div className="relative h-full w-full flex flex-col items-center justify-center p-8">
				{/* Main hero section */}
				<motion.div
					initial={{ opacity: 0, scale: 0.95 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.5, ease: "easeOut" }}
					className="flex flex-col items-center text-center mb-12"
				>
					{/* Animated terminal icon */}
					<motion.div
						initial={{ opacity: 0, y: -20 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.1, duration: 0.5 }}
						className="relative mb-8"
					>
						<div className="absolute inset-0 bg-gradient-to-br from-chart-1/30 to-chart-4/30 rounded-3xl blur-2xl" />
						<div className="relative p-6 rounded-3xl bg-gradient-to-br from-muted/40 to-muted/20 backdrop-blur-sm border border-border/40">
							<HiMiniCommandLine className="size-12 text-foreground/80" />
						</div>
					</motion.div>

					{/* Title */}
					<motion.h1
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.2, duration: 0.4 }}
						className="text-3xl font-semibold text-foreground mb-3 tracking-tight"
					>
						Ready when you are
					</motion.h1>

					{/* Subtitle */}
					<motion.p
						initial={{ opacity: 0, y: 10 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ delay: 0.3, duration: 0.4 }}
						className="text-muted-foreground text-lg max-w-md"
					>
						Create a new terminal to start working in this workspace
					</motion.p>
				</motion.div>

				{/* CTA Button */}
				<motion.button
					type="button"
					initial={{ opacity: 0, y: 10 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ delay: 0.4, duration: 0.4 }}
					whileHover={{ scale: 1.02 }}
					whileTap={{ scale: 0.98 }}
					onClick={handleNewTerminal}
					disabled={!activeWorkspace?.id}
					className="group relative mb-16 px-8 py-3.5 rounded-xl bg-foreground text-background font-medium transition-all hover:shadow-xl hover:shadow-foreground/10 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					<span className="flex items-center gap-2.5">
						<HiMiniPlus className="size-5 transition-transform group-hover:rotate-90" />
						New Terminal
					</span>
				</motion.button>

				{/* Keyboard shortcuts */}
				<motion.div
					initial={{ opacity: 0 }}
					animate={{ opacity: 1 }}
					transition={{ delay: 0.6, duration: 0.4 }}
					className="flex flex-wrap items-center justify-center gap-3"
				>
					{shortcuts.map((shortcut, index) => (
						<ShortcutPill
							key={shortcut.label}
							keys={shortcut.keys}
							label={shortcut.label}
							icon={shortcut.icon}
							delay={0.7 + index * 0.1}
						/>
					))}
				</motion.div>
			</div>
		</div>
	);
}
