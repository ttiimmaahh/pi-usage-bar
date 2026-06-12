import { existsSync } from "node:fs";
import { CONFIG_PATH } from "./config.ts";
import { formatMoney, formatTokens } from "./format.ts";
import type { UsageLedger } from "./ledger.ts";
import { parseUsageRange } from "./ranges.ts";
import type {
	ProjectInfo,
	UsageBarConfig,
	UsageSummaryRow,
	UsageTotals,
} from "./types.ts";

export function formatUsageLine(totals: UsageTotals): string {
	return `in ${formatTokens(totals.input)} · out ${formatTokens(totals.output)} · cache ${formatTokens(totals.cacheRead + totals.cacheWrite)}`;
}

export function renderReport(title: string, rows: UsageSummaryRow[]): string {
	if (rows.length === 0) return `${title}\nNo usage logged yet.`;
	return [
		title,
		...rows.map((row) => `- ${row.label}: ${formatSummaryRow(row)}`),
	].join("\n");
}

export function formatSummaryRow(row: UsageSummaryRow): string {
	const cost = costForDisplay(row);
	return `${formatTokens(row.totals.totalTokens)} tokens, ${formatMoney(cost)} (${formatUsageLine(row.totals)})`;
}

export function costForDisplay(row: UsageSummaryRow): number {
	return row.displayCost ?? row.totals.costTotal;
}

export function memorySummary(rows: UsageSummaryRow[], label: string): string {
	if (rows.length === 0) return `Usage rollup ${label}: no usage logged yet.`;
	return [
		`Usage rollup ${label}:`,
		...rows
			.slice(0, 8)
			.map((row) => `- ${row.label}: ${formatSummaryRow(row)}`),
	].join("\n");
}

export function doctorReport(args: {
	ledger: UsageLedger;
	config: UsageBarConfig;
	project: ProjectInfo;
	footerActive: boolean;
}): string {
	const checks: Array<{ status: "✓" | "⚠" | "✗"; text: string }> = [];
	checks.push({
		status: "✓",
		text: `DB: ${args.ledger.path} (${args.ledger.rowCount()} rows)`,
	});
	checks.push({
		status: existsSync(CONFIG_PATH) ? "✓" : "⚠",
		text: existsSync(CONFIG_PATH)
			? `Config: ${CONFIG_PATH}`
			: `Config not written yet: ${CONFIG_PATH}`,
	});
	checks.push({
		status: args.project.projectKey.endsWith("/_root") ? "⚠" : "✓",
		text: `Current project: ${args.project.projectKey}`,
	});
	checks.push({
		status: args.footerActive ? "✓" : "⚠",
		text: args.footerActive
			? "Footer renderer active"
			: "Footer renderer not active in this mode",
	});
	checks.push({
		status: "✓",
		text: `Aliases: ${Object.keys(args.config.projectAliases).length}`,
	});
	return [
		"pi-usage-bar doctor",
		...checks.map((check) => `${check.status} ${check.text}`),
	].join("\n");
}

export function rangeLabel(words: string[]): string {
	return parseUsageRange(words).label;
}
