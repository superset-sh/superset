import {
	BottomSheetBackdrop,
	type BottomSheetBackdropProps,
	BottomSheetHandle,
	type BottomSheetHandleProps,
	BottomSheetModal,
	type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { useCallback, useEffect, useMemo, useRef } from "react";

export type BottomSheetProps = Omit<
	BottomSheetModalProps,
	"snapPoints" | "ref" | "onDismiss" | "onChange"
> & {
	/** Controlled visibility. true → present(), false → dismiss(). */
	open: boolean;
	/** Called when the sheet finishes dismissing (drag-down, backdrop tap, programmatic). */
	onClose?: () => void;
	/** Snap points as percentages ("50%") or fixed pixels (300). Default: ["50%"]. */
	snapPoints?: ReadonlyArray<string | number>;
	/** Default true — drag down to dismiss. */
	enablePanDownToClose?: boolean;
	/** Default true — tap backdrop to dismiss. */
	enableBackdropDismiss?: boolean;
};

/**
 * Project-themed wrapper around @gorhom/bottom-sheet `BottomSheetModal`.
 *
 * Used by UC-PAUSE-02 ask_user · UC-SESS-04 overflow menu · UC-NAV-04
 * new-chat picker · UC-NAV-08 project/filter pickers. Composes the canonical
 * gorhom primitives — Backdrop, Handle — with theme-token styling via
 * inline color (uniwind className not yet supported on gorhom-internal nodes).
 *
 * Mounts must live under a `BottomSheetModalProvider` (wired in the app shell
 * root layout, and in the Storybook RN preview decorator).
 */
export function BottomSheet({
	open,
	onClose,
	snapPoints = ["50%"],
	enablePanDownToClose = true,
	enableBackdropDismiss = true,
	children,
	...rest
}: BottomSheetProps) {
	const ref = useRef<BottomSheetModal>(null);
	const resolvedSnapPoints = useMemo(() => [...snapPoints], [snapPoints]);

	useEffect(() => {
		if (open) ref.current?.present();
		else ref.current?.dismiss();
	}, [open]);

	const renderBackdrop = useCallback(
		(backdropProps: BottomSheetBackdropProps) => (
			<BottomSheetBackdrop
				{...backdropProps}
				appearsOnIndex={0}
				disappearsOnIndex={-1}
				opacity={0.5}
				pressBehavior={enableBackdropDismiss ? "close" : "none"}
			/>
		),
		[enableBackdropDismiss],
	);

	const renderHandle = useCallback(
		(handleProps: BottomSheetHandleProps) => (
			<BottomSheetHandle
				{...handleProps}
				indicatorStyle={{ backgroundColor: "rgba(255,255,255,0.32)" }}
				style={{
					backgroundColor: "#1a1716",
					borderTopLeftRadius: 16,
					borderTopRightRadius: 16,
				}}
			/>
		),
		[],
	);

	return (
		<BottomSheetModal
			ref={ref}
			snapPoints={resolvedSnapPoints}
			enablePanDownToClose={enablePanDownToClose}
			onDismiss={onClose}
			backdropComponent={renderBackdrop}
			handleComponent={renderHandle}
			backgroundStyle={{ backgroundColor: "#1a1716" }}
			{...rest}
		>
			{children}
		</BottomSheetModal>
	);
}
