import { Type, type Static } from "typebox";
import type { ToolDefinition } from "@earendil-works/pi-coding-agent";
import { formatMoney, formatTokens } from "./format.ts";
import { costForDisplay } from "./reports.ts";
import type { UsageLedger } from "./ledger.ts";
import { parseUsageRange } from "./ranges.ts";
import type { UsageSummaryRow } from "./types.ts";

const querySchema = Type.Object({
	groupBy: Type.Optional(
		Type.Union([
			Type.Literal("summary"),
			Type.Literal("project"),
			Type.Literal("model"),
			Type.Literal("session"),
		]),
	),
	range: Type.Optional(Type.String()),
	projectKey: Type.Optional(Type.String()),
	limit: Type.Optional(Type.Number()),
});

type QueryParams = Static<typeof querySchema>;

export function createUsageQueryTool(
	ledger: UsageLedger,
): ToolDefinition<typeof querySchema> {
	return {
		name: "usage_query",
		label: "Usage Query",
		description:
			"Query local Pi token/cost usage rollups by summary, project, model, or session.",
		parameters: querySchema,
		async execute(_toolCallId, params: QueryParams) {
			const groupBy = params.groupBy ?? "project";
			const range = parseUsageRange(
				params.range?.split(/\s+/).filter(Boolean) ?? ["all"],
			);
			const limit =
				params.limit && params.limit > 0 ? Math.min(params.limit, 50) : 10;
			const options = { range, projectKey: params.projectKey, limit };
			if (groupBy === "summary") {
				const totals = params.projectKey
					? ledger.totalsForProjectRange(params.projectKey, range)
					: ledger.totalsForRange(range);
				const models = ledger.recentModelTotalsRange({
					...options,
					limit: Math.min(limit, 10),
				});
				return {
					content: [
						{
							type: "text",
							text: [
								params.projectKey
									? `Usage summary for ${params.projectKey} (${range.label})`
									: `Usage summary (${range.label})`,
								`Total: ${formatTokens(totals.totalTokens)} tokens, ${formatMoney(totals.costTotal)}`,
								renderRows("By model", models),
							].join("\n"),
						},
					],
					details: {
						groupBy,
						range,
						projectKey: params.projectKey,
						totals,
						models,
					},
				};
			}
			const rows =
				groupBy === "model"
					? ledger.recentModelTotalsRange(options)
					: groupBy === "session"
						? ledger.recentSessionTotalsRange(options)
						: ledger.recentProjectTotalsRange(options);
			return {
				content: [
					{
						type: "text",
						text: renderRows(`Usage by ${groupBy} (${range.label})`, rows),
					},
				],
				details: { groupBy, range, projectKey: params.projectKey, rows },
			};
		},
	};
}

function renderRows(title: string, rows: UsageSummaryRow[]): string {
	if (rows.length === 0) return `${title}\nNo usage logged.`;
	return [
		title,
		...rows.map(
			(row) =>
				`- ${row.label}: ${formatTokens(row.totals.totalTokens)} tokens, ${formatMoney(costForDisplay(row))}`,
		),
	].join("\n");
}
