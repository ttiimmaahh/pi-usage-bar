import test from "node:test";
import assert from "node:assert/strict";
import { calculateListCost, pricingFromModel } from "../src/pricing.ts";
import type { UsageTotals } from "../src/types.ts";

const usage: UsageTotals = {
	input: 1000,
	output: 2000,
	cacheRead: 3000,
	cacheWrite: 4000,
	totalTokens: 10000,
	costInput: 0,
	costOutput: 0,
	costCacheRead: 0,
	costCacheWrite: 0,
	costTotal: 0,
};

test("calculateListCost applies per-million-token pricing by usage class", () => {
	const priced = calculateListCost(usage, {
		input: 1,
		output: 2,
		cacheRead: 0.1,
		cacheWrite: 0.5,
		source: "test",
	});
	assert.ok(priced);
	assert.equal(priced.costInput, 0.001);
	assert.equal(priced.costOutput, 0.004);
	assert.ok(Math.abs(priced.costCacheRead - 0.0003) < 1e-12);
	assert.equal(priced.costCacheWrite, 0.002);
	assert.ok(Math.abs(priced.costTotal - 0.0073) < 1e-12);
});

test("calculateListCost keeps Opus-scale pricing in dollars not millions of dollars", () => {
	const priced = calculateListCost(
		{
			...usage,
			input: 121_000,
			output: 1_000,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 122_000,
		},
		{ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25, source: "test" },
	);
	assert.ok(priced);
	assert.equal(priced.costTotal, 0.63);
});

test("pricingFromModel extracts model registry pricing", () => {
	const pricing = pricingFromModel({
		cost: { input: 1, output: 2, cacheRead: 3, cacheWrite: 4 },
	} as Parameters<typeof pricingFromModel>[0]);
	assert.deepEqual(pricing, {
		input: 1,
		output: 2,
		cacheRead: 3,
		cacheWrite: 4,
		source: "model-registry",
	});
});
