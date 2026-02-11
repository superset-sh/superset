import { Outlit } from "@outlit/node";
import { env } from "main/env.main";

let outlit: Outlit | null = null;

export function getOutlit(): Outlit | null {
	if (!env.NEXT_PUBLIC_OUTLIT_KEY) return null;

	if (!outlit) {
		outlit = new Outlit({
			publicKey: env.NEXT_PUBLIC_OUTLIT_KEY,
		});
	}
	return outlit;
}

export async function shutdownOutlit(): Promise<void> {
	if (outlit) {
		await outlit.shutdown();
		outlit = null;
	}
}
