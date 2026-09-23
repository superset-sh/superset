import { PhoneFrame } from "../PhoneFrame";
import { ReviewScreen } from "../ReviewScreen";
import { SessionScreen } from "../SessionScreen";
import { WorkspacesScreen } from "../WorkspacesScreen";

export function StackedPhones() {
	return (
		<div
			aria-hidden="true"
			className="@container pointer-events-none mx-auto w-full max-w-[480px] select-none"
		>
			<div className="relative h-[125cqw]">
				<div className="absolute top-0 left-0 h-[600px] w-[480px] origin-top-left [transform:scale(calc(100cqw/480px))]">
					<div className="absolute top-8 left-4 -rotate-6 scale-[0.88] opacity-60">
						<PhoneFrame>
							<SessionScreen />
						</PhoneFrame>
					</div>
					<div className="absolute top-8 right-4 rotate-6 scale-[0.88] opacity-60">
						<PhoneFrame>
							<ReviewScreen />
						</PhoneFrame>
					</div>
					<div className="absolute top-0 left-[108px] z-10">
						<PhoneFrame>
							<WorkspacesScreen />
						</PhoneFrame>
					</div>
				</div>
			</div>
		</div>
	);
}
