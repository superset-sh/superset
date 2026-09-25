import { GlobalRegistrator } from "@happy-dom/global-registrator";

export function registerDom(): void {
	if (!GlobalRegistrator.isRegistered) GlobalRegistrator.register();
	(
		globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
	).IS_REACT_ACT_ENVIRONMENT = true;
}
