import { cn } from "@superset/ui/utils";
import { useEffect } from "react";
import { create } from "zustand";

interface SetupChromeState {
	backTo: string | null;
	setBackTo: (target: string | null) => void;
}

export const useSetupChromeStore = create<SetupChromeState>((set) => ({
	backTo: null,
	setBackTo: (target) => set({ backTo: target }),
}));

interface StepShellProps {
	children: React.ReactNode;
	/** Route path to navigate to when the chrome's Back button is clicked. */
	backTo?: string;
	maxWidth?: "sm" | "md" | "lg" | "xl";
	className?: string;
}

const MAX_WIDTHS: Record<NonNullable<StepShellProps["maxWidth"]>, string> = {
	sm: "max-w-sm",
	md: "max-w-md",
	lg: "max-w-lg",
	xl: "max-w-xl",
};

export function StepShell({
	children,
	backTo,
	maxWidth = "md",
	className,
}: StepShellProps) {
	const setBackTo = useSetupChromeStore((s) => s.setBackTo);
	useEffect(() => {
		setBackTo(backTo ?? null);
		return () => setBackTo(null);
	}, [backTo, setBackTo]);

	return (
		<div className="flex h-full w-full items-center justify-center bg-[#151110] px-6 py-8">
			<div
				className={cn(
					"flex w-full flex-col gap-5",
					MAX_WIDTHS[maxWidth],
					className,
				)}
			>
				{children}
			</div>
		</div>
	);
}

interface StepHeaderProps {
	title: string;
	subtitle?: string;
	icon?: React.ReactNode;
}

export function StepHeader({ title, subtitle, icon }: StepHeaderProps) {
	return (
		<div className="flex flex-col items-center gap-4 text-center">
			{icon}
			<div className="space-y-1">
				<h1 className="text-[14px] font-semibold text-[#eae8e6]">{title}</h1>
				{subtitle && <p className="text-[12px] text-[#a8a5a3]">{subtitle}</p>}
			</div>
		</div>
	);
}

interface SupersetPillProps {
	children: React.ReactNode;
}

export function SupersetPill({ children }: SupersetPillProps) {
	return (
		<div className="flex items-center justify-center gap-2 rounded-2xl border border-[#2a2827] bg-[#201e1c] p-2">
			{children}
		</div>
	);
}
