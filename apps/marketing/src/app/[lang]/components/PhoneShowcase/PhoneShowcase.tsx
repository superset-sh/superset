import { SpreadPhones } from "./components/SpreadPhones";
import { StackedPhones } from "./components/StackedPhones";

interface PhoneShowcaseProps {
	layout?: "stack" | "spread";
}

export function PhoneShowcase({ layout = "stack" }: PhoneShowcaseProps) {
	return layout === "spread" ? <SpreadPhones /> : <StackedPhones />;
}
