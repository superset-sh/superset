import {
	BottomSheetBackdrop,
	type BottomSheetBackdropProps,
	BottomSheetHandle,
	type BottomSheetHandleProps,
	BottomSheetModal,
	type BottomSheetModalProps,
} from "@gorhom/bottom-sheet";
import { forwardRef, useCallback, useMemo } from "react";

// biome-ignore lint/suspicious/noExplicitAny: gorhom BottomSheetModal is generic over T = any for data, matches their public ref type
export type BottomSheetRef = BottomSheetModal<any>;

export type BottomSheetProps = Omit<
	BottomSheetModalProps,
	"snapPoints" | "ref"
> & {
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
 * Imperative API per gorhom docs:
 *   const ref = useRef<BottomSheetRef>(null);
 *   <BottomSheet ref={ref}>…</BottomSheet>
 *   <Button onPress={() => ref.current?.present()} />
 *
 * Used by UC-PAUSE-02 ask_user · UC-SESS-04 overflow menu · UC-NAV-04
 * new-chat picker · UC-NAV-08 project/filter pickers. Composes the canonical
 * gorhom primitives — Backdrop, Handle — with project-themed styling.
 *
 * Mounts must live under a `BottomSheetModalProvider`. In production this is
 * wired in the app shell root layout; in Storybook RN, wrap the harness with
 * `GestureHandlerRootView` + `BottomSheetModalProvider` (see the story).
 */
export const BottomSheet = forwardRef<BottomSheetRef, BottomSheetProps>(
	function BottomSheet(
		{
			snapPoints = ["50%"],
			enablePanDownToClose = true,
			enableBackdropDismiss = true,
			children,
			...rest
		},
		ref,
	) {
		const resolvedSnapPoints = useMemo(() => [...snapPoints], [snapPoints]);

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
				backdropComponent={renderBackdrop}
				handleComponent={renderHandle}
				backgroundStyle={{ backgroundColor: "#1a1716" }}
				{...rest}
			>
				{children}
			</BottomSheetModal>
		);
	},
);
