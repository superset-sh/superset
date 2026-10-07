import { expect, test } from "bun:test";
import path from "node:path";

for (const enabled of [false, true]) {
	test(`retained Stripe customers ${enabled ? "use configured billing" : "do not activate disabled billing"}`, () => {
		const script = `
import {mock} from "bun:test";
import assert from "node:assert/strict";
import {initTRPC,TRPCError} from "@trpc/server";
let calls=0;
const request=(value)=>async()=>{calls++;return value};
mock.module("@superset/auth/stripe",()=>({isBillingEnabled:${enabled},stripeClient:{invoices:{list:request({data:[]})},customers:{retrieve:request({name:"Owned",email:null,address:null}),listTaxIds:request({data:[]})},paymentMethods:{list:request({data:[]})},billingPortal:{sessions:{create:request({url:"https://billing.example.test"})}}}}));
mock.module("@superset/db/client",()=>({db:{query:{members:{findFirst:async()=>({role:"owner"})},organizations:{findFirst:async()=>({stripeCustomerId:"cus_retained_fixture"})},subscriptions:{findFirst:async()=>({plan:"pro",status:"active"})}}}}));
mock.module(${JSON.stringify(path.resolve(import.meta.dir, "../../env.ts"))},()=>({env:{NEXT_PUBLIC_WEB_URL:"https://app.example.test"}}));
const t=initTRPC.create();
mock.module(${JSON.stringify(path.resolve(import.meta.dir, "../../trpc.ts"))},()=>({protectedProcedure:t.procedure,userError:(input)=>new TRPCError(input)}));
const {billingRouter}=await import(${JSON.stringify(path.join(import.meta.dir, "billing.ts"))});
const caller=t.router(billingRouter).createCaller({activeOrganizationId:"owned-org",session:{user:{id:"owned-user"}}});
assert.deepEqual(await caller.invoices(),[]);
assert.equal(await caller.outstandingInvoice(),null);
const details=await caller.details();
const plan=await caller.activePlan();
if(${enabled}){
 assert.equal(details.name,"Owned");assert.equal(plan.plan,"pro");
 assert.deepEqual(await caller.portal({}),{url:"https://billing.example.test"});assert.equal(calls,6);
}else{
 assert.equal(details,null);assert.equal(plan.plan,"free");assert.equal(plan.lapsed,false);
 await assert.rejects(caller.portal({}),error=>error.code==="BAD_REQUEST"&&error.message==="No Stripe customer found");assert.equal(calls,0);
}
`;
		const result = Bun.spawnSync(
			[process.execPath, "--no-env-file", "-e", script],
			{
				cwd: path.resolve(import.meta.dir, "../../.."),
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
