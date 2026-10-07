import { expect, test } from "bun:test";
import path from "node:path";

for (const key of [undefined, "", "  ", "sk_disposable_configured"]) {
	test(`billing subscription operations follow ${key?.trim() ? "configured" : "absent"} credentials`, () => {
		const script = `
import {mock} from "bun:test";
import assert from "node:assert/strict";
import {stripe} from "@better-auth/stripe";
mock.module(${JSON.stringify(path.join(import.meta.dir, "env.ts"))},()=>({env:{STRIPE_SECRET_KEY:${JSON.stringify(key)}}}));
const {stripeClient,isBillingEnabled}=await import(${JSON.stringify(path.join(import.meta.dir, "stripe.ts"))});
assert.equal(isBillingEnabled,${Boolean(key?.trim())});
const plugin=stripe({stripeClient,stripeWebhookSecret:"",subscription:{enabled:isBillingEnabled,plans:[]}});
assert.equal("upgradeSubscription" in plugin.endpoints,isBillingEnabled);
assert.equal("cancelSubscription" in plugin.endpoints,isBillingEnabled);
assert.equal("subscription" in plugin.schema,isBillingEnabled);
`;
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "-e", script],
			{
				cwd: path.resolve(import.meta.dir, ".."),
				env: { PATH: process.env.PATH },
				stdout: "pipe",
				stderr: "pipe",
				timeout: 5000,
			},
		);
		expect(result.stderr.toString()).toBe("");
		expect(result.exitCode).toBe(0);
	});
}
