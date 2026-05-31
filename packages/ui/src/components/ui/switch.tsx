"use client";

import * as React from "react";

import { cn } from "../../lib/utils";

interface SwitchProps
	extends Omit<
		React.ButtonHTMLAttributes<HTMLButtonElement>,
		"checked" | "defaultChecked" | "onChange" | "value"
	> {
	checked?: boolean;
	defaultChecked?: boolean;
	onCheckedChange?: (checked: boolean) => void;
	required?: boolean;
	value?: string;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
	(
		{
			className,
			checked: checkedProp,
			defaultChecked = false,
			disabled,
			form,
			name,
			onCheckedChange,
			onClick,
			required,
			value = "on",
			...props
		},
		ref,
	) => {
		const [uncontrolledChecked, setUncontrolledChecked] =
			React.useState(defaultChecked);
		const checked = checkedProp ?? uncontrolledChecked;

		function updateChecked(nextChecked: boolean) {
			if (disabled) return;
			if (checkedProp === undefined) {
				setUncontrolledChecked(nextChecked);
			}
			onCheckedChange?.(nextChecked);
		}

		return (
			<button
				aria-checked={checked}
				aria-required={required}
				className={cn(
					"peer data-[state=checked]:bg-primary data-[state=unchecked]:bg-input focus-visible:border-ring focus-visible:ring-ring/50 dark:data-[state=unchecked]:bg-input/80 inline-flex h-[1.15rem] w-8 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50",
					className,
				)}
				data-disabled={disabled ? "" : undefined}
				data-slot="switch"
				data-state={checked ? "checked" : "unchecked"}
				disabled={disabled}
				form={form}
				ref={ref}
				role="switch"
				type="button"
				value={value}
				onClick={(event) => {
					onClick?.(event);
					if (event.defaultPrevented) return;
					updateChecked(!checked);
				}}
				{...props}
			>
				{name ? (
					<input
						aria-hidden="true"
						checked={checked}
						disabled={disabled}
						form={form}
						name={name}
						readOnly
						required={required}
						tabIndex={-1}
						type="checkbox"
						value={value}
						className="sr-only"
					/>
				) : null}
				<span
					data-slot="switch-thumb"
					data-state={checked ? "checked" : "unchecked"}
					className={cn(
						"bg-background dark:data-[state=unchecked]:bg-foreground dark:data-[state=checked]:bg-primary-foreground pointer-events-none block size-4 rounded-full ring-0 transition-transform data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0",
					)}
				/>
			</button>
		);
	},
);
Switch.displayName = "Switch";

export { Switch };
