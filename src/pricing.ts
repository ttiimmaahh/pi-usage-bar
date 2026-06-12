import type { Model } from "@earendil-works/pi-ai";
import type { UsagePricing, UsageTotals } from "./types.ts";

export function pricingFromModel(
	model: Model<any> | undefined,
): UsagePricing | undefined {
	if (!model?.cost) return undefined;
	return {
		input: model.cost.input,
		output: model.cost.output,
		cacheRead: model.cost.cacheRead,
		cacheWrite: model.cost.cacheWrite,
		source: "model-registry",
	};
}

export function calculateListCost(
	usage: UsageTotals,
	pricing: UsagePricing | undefined,
): UsageTotals | undefined {
	if (!pricing) return undefined;
	const perMillion = (tokens: number, pricePerMillion: number) =>
		(tokens / 1_000_000) * pricePerMillion;
	const costInput = perMillion(usage.input, pricing.input);
	const costOutput = perMillion(usage.output, pricing.output);
	const costCacheRead = perMillion(usage.cacheRead, pricing.cacheRead);
	const costCacheWrite = perMillion(usage.cacheWrite, pricing.cacheWrite);
	return {
		...usage,
		costInput,
		costOutput,
		costCacheRead,
		costCacheWrite,
		costTotal: costInput + costOutput + costCacheRead + costCacheWrite,
	};
}
