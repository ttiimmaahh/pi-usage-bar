import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExtensionAPI, ThemeColor } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import {
	parseAttributionCommand,
	rangeFromSubcommand,
	splitProjectAndRange,
	isSegmentName,
} from "./commands.ts";
import {
	CONFIG_PATH,
	loadConfig,
	normalizeProjectKey,
	saveConfig,
} from "./config.ts";
import {
	formatModelName,
	formatMoney,
	formatTokens,
	progressBar,
	stripAnsi,
	truncatePlain,
} from "./format.ts";
import { UsageLedger } from "./ledger.ts";
import { pricingFromModel } from "./pricing.ts";
import { displayProjectLabel, resolveProjectInfo } from "./project.ts";
import { parseUsageRange } from "./ranges.ts";
import {
	doctorReport,
	formatUsageLine,
	memorySummary,
	renderReport,
} from "./reports.ts";
import { createUsageQueryTool } from "./tools.ts";
import type {
	ProjectInfo,
	SegmentName,
	UsageBarConfig,
	UsageTotals,
} from "./types.ts";
import {
	dayOf,
	emptyTotals,
	isAssistantMessage,
	makeUsageEvent,
	plus,
	sessionUsageFromBranch,
	usageEventsFromBranch,
} from "./usage-events.ts";

const SEGMENT_SEPARATOR = "│";
const USAGE_BAR_DIR = join(getAgentDir(), "pi-usage-bar");
const EXPORT_PATH = join(USAGE_BAR_DIR, "usage-export.json");
const BACKUP_DIR = join(USAGE_BAR_DIR, "backups");

type MutableState = {
	config: UsageBarConfig;
	project: ProjectInfo;
	sessionTotals: UsageTotals;
	projectTotals: UsageTotals;
	todayProjectTotals: UsageTotals;
	warnedAmbiguousProject: boolean;
	requestRender?: () => void;
};

function contextColor(
	percent: number | null | undefined,
	config: UsageBarConfig,
): ThemeColor {
	if (percent === null || percent === undefined) return "muted";
	if (percent >= config.errorThreshold) return "error";
	if (percent >= config.warningThreshold) return "warning";
	return "success";
}

function visibleExtensionStatuses(
	statuses: ReadonlyMap<string, string>,
): string | null {
	const values = [...statuses.entries()]
		.filter(([key, value]) => key !== "pi-usage-bar" && value.trim().length > 0)
		.map(([, value]) => truncatePlain(stripAnsi(value), 28));
	return values.length > 0 ? values.join(" ❯ ") : null;
}

function isAmbiguousRootProject(projectKey: string): boolean {
	return projectKey.endsWith("/_root");
}

function describeSegments(config: UsageBarConfig): string {
	return config.segments.join(", ");
}

function alignRight(left: string, right: string, width: number): string {
	const rightWidth = visibleWidth(right);
	if (rightWidth >= width) return truncateToWidth(right, width);
	const availableLeftWidth = width - rightWidth - 1;
	if (availableLeftWidth <= 0) return truncateToWidth(right, width);
	const leftText = truncateToWidth(left, availableLeftWidth);
	const gap = Math.max(1, width - visibleWidth(leftText) - rightWidth);
	return `${leftText}${" ".repeat(gap)}${right}`;
}

export default function (pi: ExtensionAPI): void {
	const ledger = new UsageLedger();
	const state: MutableState = {
		config: loadConfig(),
		project: resolveProjectInfo(process.cwd(), loadConfig()),
		sessionTotals: emptyTotals(),
		projectTotals: emptyTotals(),
		todayProjectTotals: emptyTotals(),
		warnedAmbiguousProject: false,
	};

	function reloadConfig(): void {
		state.config = loadConfig();
	}

	function refreshProject(cwd: string): void {
		reloadConfig();
		state.project = resolveProjectInfo(cwd, state.config);
	}

	function refreshProjectTotals(): void {
		const today = dayOf(new Date());
		state.projectTotals = ledger.totalsForProject(state.project.projectKey);
		state.todayProjectTotals = ledger.totalsForProject(
			state.project.projectKey,
			today,
		);
	}

	function backfillSession(
		ctx: Parameters<Parameters<ExtensionAPI["on"]>[1]>[1],
	): void {
		let insertedAny = false;
		for (const event of usageEventsFromBranch(
			ctx.sessionManager.getBranch(),
			state.project,
			ctx.sessionManager,
			state.config,
		)) {
			insertedAny = ledger.insertEvent(event) || insertedAny;
		}
		if (insertedAny) refreshProjectTotals();
	}

	pi.on("session_start", (_event, ctx) => {
		refreshProject(ctx.cwd);
		if (
			ctx.hasUI &&
			isAmbiguousRootProject(state.project.projectKey) &&
			!state.warnedAmbiguousProject
		) {
			state.warnedAmbiguousProject = true;
			ctx.ui.notify(
				`Usage is being attributed to ${state.project.projectKey} because Pi is running from a gitroot parent directory. Run /usage move ${state.project.projectKey} to <project> for a one-time merge, or /usage alias ${state.project.projectKey} to <project> if this should always map there.`,
				"warning",
			);
		}
		backfillSession(ctx);
		state.sessionTotals = ledger.totalsForSession(
			ctx.sessionManager.getSessionId(),
		);
		const branchTotals = sessionUsageFromBranch(ctx.sessionManager.getBranch());
		if (branchTotals.totalTokens > state.sessionTotals.totalTokens) {
			state.sessionTotals = branchTotals;
		}
		refreshProjectTotals();

		if (!ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			state.requestRender = () => tui.requestRender();
			const unsubscribeBranch = footerData.onBranchChange(() =>
				tui.requestRender(),
			);
			return {
				dispose() {
					state.requestRender = undefined;
					unsubscribeBranch();
				},
				invalidate() {},
				render(width: number): string[] {
					const usage = ctx.getContextUsage();
					const percent = usage?.percent ?? null;
					const contextText = usage
						? `${progressBar(percent, 10)} ${percent !== null ? `${percent.toFixed(0)}%` : "—%"} (${formatTokens(usage.contextWindow)})`
						: `${progressBar(null, 10)} —`;
					const extensionStatuses = visibleExtensionStatuses(
						footerData.getExtensionStatuses?.() ?? new Map(),
					);
					const thinkingSegment = `${theme.fg("text", "thinking:")} ${theme.fg(
						"muted",
						pi.getThinkingLevel(),
					)}`;
					const segments: Record<SegmentName, string | null> = {
						model: theme.fg("accent", formatModelName(ctx.model?.id)),
						context: theme.fg(contextColor(percent, state.config), contextText),
						session: theme.fg(
							"text",
							`sess ${formatTokens(state.sessionTotals.totalTokens)}`,
						),
						cost: theme.fg(
							"warning",
							formatMoney(state.sessionTotals.costTotal),
						),
						project: theme.fg(
							isAmbiguousRootProject(state.project.projectKey)
								? "warning"
								: "muted",
							displayProjectLabel(state.project, state.config),
						),
						extensions: extensionStatuses
							? theme.fg("text", extensionStatuses)
							: null,
						thinking: thinkingSegment,
					};
					const separator = ` ${theme.fg("dim", SEGMENT_SEPARATOR)} `;
					const leftSegments = state.config.segments
						.filter((segment) => segment !== "thinking")
						.map((segment) => segments[segment])
						.filter((segment): segment is string => Boolean(segment));
					const lineOne = state.config.segments.includes("thinking")
						? alignRight(leftSegments.join(separator), thinkingSegment, width)
						: leftSegments.join(separator);
					if (!state.config.showSecondLine)
						return [truncateToWidth(lineOne, width)];
					const branch = state.project.gitBranch
						? ` · ${state.project.gitBranch}`
						: "";
					const lineTwo = theme.fg(
						"dim",
						`▶ ${formatUsageLine(state.sessionTotals)} · project today ${formatTokens(state.todayProjectTotals.totalTokens)}${branch}`,
					);
					return [
						truncateToWidth(lineOne, width),
						truncateToWidth(lineTwo, width),
					];
				},
			};
		});
	});

	pi.on("thinking_level_select", () => {
		state.requestRender?.();
	});

	pi.on("message_end", (event, ctx) => {
		if (!isAssistantMessage(event.message)) return;
		refreshProject(ctx.cwd);
		const usageEvent = makeUsageEvent(
			event.message,
			state.project,
			ctx.sessionManager,
			state.config,
			pricingFromModel(ctx.model),
		);
		const inserted = ledger.insertEvent(usageEvent);
		if (inserted) {
			state.sessionTotals = plus(state.sessionTotals, usageEvent.usage);
			refreshProjectTotals();
			state.requestRender?.();
		}
	});

	pi.on("session_shutdown", (_event, ctx) => {
		if (ctx.hasUI) ctx.ui.setFooter(undefined);
		ledger.close();
	});

	pi.registerTool(createUsageQueryTool(ledger));

	pi.registerCommand("usage", {
		description: "Show and manage Pi token/cost usage attribution",
		getArgumentCompletions: (prefix) => {
			const commands = [
				"session",
				"today",
				"project",
				"projects",
				"models",
				"sessions",
				"summary",
				"backup",
				"export",
				"memory-summary",
				"doctor",
				"attribute",
				"aliases",
				"unalias",
				"undo",
				"yesterday",
				"week",
				"month",
				"since",
				"between",
				"change",
				"alias",
				"move",
				"merge",
				"segments",
				"display",
				"backup",
				"db",
				"config",
				"help",
			];
			return commands
				.filter((command) => command.startsWith(prefix.trim()))
				.map((command) => ({ value: command, label: command }));
		},
		handler: async (args, ctx) => {
			const trimmed = args.trim();
			const change = parseAttributionCommand(trimmed);
			refreshProject(ctx.cwd);
			state.sessionTotals = ledger.totalsForSession(
				ctx.sessionManager.getSessionId(),
			);
			refreshProjectTotals();

			if (change) {
				if (!change.from || !change.to) {
					ctx.ui.notify(
						"Usage attribution requires both source and target project keys.",
						"error",
					);
					return;
				}
				if (change.persistAlias) {
					state.config.projectAliases[change.from] = change.to;
					saveConfig(state.config);
				}
				const result = ledger.reattributeProject(
					change.from,
					change.to,
					change.persistAlias,
				);
				refreshProject(ctx.cwd);
				refreshProjectTotals();
				state.requestRender?.();
				const aliasNote = change.persistAlias
					? `Alias saved in config: ${CONFIG_PATH}`
					: `No alias saved. Future usage in ${change.from} will remain there until you run another /usage move, or run Pi from the target repo.`;
				ctx.ui.notify(
					`Attributed ${result.changedRows} usage event(s): ${change.from} → ${change.to}\n` +
						`Moved: ${formatTokens(result.fromBefore.totalTokens)} tokens, ${formatMoney(result.fromBefore.costTotal)}\n` +
						`Target before: ${formatTokens(result.toBefore.totalTokens)} tokens, ${formatMoney(result.toBefore.costTotal)}\n` +
						`Target after: ${formatTokens(result.toAfter.totalTokens)} tokens, ${formatMoney(result.toAfter.costTotal)}\n` +
						aliasNote,
					"info",
				);
				return;
			}

			const [subcommand = "session", ...rest] = trimmed.split(/\s+/);
			const rangeCommand = rangeFromSubcommand(subcommand, rest);
			const range = parseUsageRange(rangeCommand.words);
			switch (subcommand) {
				case "session":
					ctx.ui.notify(
						`Current session: ${formatTokens(state.sessionTotals.totalTokens)} tokens, ${formatMoney(state.sessionTotals.costTotal)}\n${formatUsageLine(state.sessionTotals)}\nDB: ${ledger.path}`,
						"info",
					);
					return;
				case "today":
				case "yesterday":
				case "week":
				case "month":
				case "since":
				case "between":
					ctx.ui.notify(
						renderReport(
							`Usage ${range.label}`,
							ledger.recentProjectTotalsRange({ range, limit: 15 }),
						),
						"info",
					);
					return;
				case "project": {
					const parsed = splitProjectAndRange(rest, state.project.projectKey);
					const projectRange = parseUsageRange(parsed.rangeWords);
					const totals = ledger.totalsForProjectRange(
						parsed.projectKey,
						projectRange,
					);
					const modelRows = ledger.recentModelTotalsRange({
						range: projectRange,
						projectKey: parsed.projectKey,
						limit: 10,
					});
					ctx.ui.notify(
						[
							`${parsed.projectKey} (${projectRange.label}): ${formatTokens(totals.totalTokens)} tokens, ${formatMoney(totals.costTotal)}`,
							formatUsageLine(totals),
							"",
							renderReport("By model", modelRows),
						].join("\n"),
						"info",
					);
					return;
				}
				case "projects": {
					const projectRange = parseUsageRange(rest);
					ctx.ui.notify(
						renderReport(
							`Top projects (${projectRange.label})`,
							ledger.recentProjectTotalsRange({
								range: projectRange,
								limit: 15,
							}),
						),
						"info",
					);
					return;
				}
				case "models": {
					const modelRange = parseUsageRange(rest);
					ctx.ui.notify(
						renderReport(
							`Top models (${modelRange.label})`,
							ledger.recentModelTotalsRange({ range: modelRange, limit: 15 }),
						),
						"info",
					);
					return;
				}
				case "sessions": {
					const sessionRange = parseUsageRange(rest);
					ctx.ui.notify(
						renderReport(
							`Top sessions (${sessionRange.label})`,
							ledger.recentSessionTotalsRange({
								range: sessionRange,
								limit: 15,
							}),
						),
						"info",
					);
					return;
				}
				case "summary": {
					const parsed = splitProjectAndRange(rest, "");
					const hasProjectFilter = parsed.projectKey.length > 0;
					const summaryRange = parseUsageRange(
						hasProjectFilter ? parsed.rangeWords : rest,
					);
					const totals = hasProjectFilter
						? ledger.totalsForProjectRange(parsed.projectKey, summaryRange)
						: ledger.totalsForRange(summaryRange);
					const title = hasProjectFilter
						? `Usage summary for ${parsed.projectKey} (${summaryRange.label})`
						: `Usage summary (${summaryRange.label})`;
					ctx.ui.notify(
						[
							title,
							`Total: ${formatTokens(totals.totalTokens)} tokens, ${formatMoney(totals.costTotal)}`,
							formatUsageLine(totals),
							"",
							renderReport(
								"By model",
								ledger.recentModelTotalsRange({
									range: summaryRange,
									projectKey: hasProjectFilter ? parsed.projectKey : undefined,
									limit: 10,
								}),
							),
						].join("\n"),
						"info",
					);
					return;
				}
				case "backup": {
					const stamp = new Date().toISOString().replace(/[:.]/g, "-");
					const backupPath = join(BACKUP_DIR, `usage-${stamp}.sqlite`);
					ledger.backupTo(backupPath);
					ctx.ui.notify(`Backed up usage ledger to ${backupPath}`, "info");
					return;
				}
				case "export": {
					const limit = Number.parseInt(rest[0] ?? "1000", 10);
					mkdirSync(USAGE_BAR_DIR, { recursive: true });
					writeFileSync(
						EXPORT_PATH,
						`${JSON.stringify(ledger.exportEvents(Number.isFinite(limit) ? limit : 1000), null, "\t")}\n`,
						"utf8",
					);
					ctx.ui.notify(`Exported usage events to ${EXPORT_PATH}`, "info");
					return;
				}
				case "memory-summary": {
					const summaryRange = parseUsageRange(
						rest.length > 0 ? rest : ["today"],
					);
					ctx.ui.notify(
						memorySummary(
							ledger.recentProjectTotalsRange({
								range: summaryRange,
								limit: 8,
							}),
							summaryRange.label,
						),
						"info",
					);
					return;
				}
				case "doctor":
					ctx.ui.notify(
						doctorReport({
							ledger,
							config: state.config,
							project: state.project,
							footerActive: Boolean(state.requestRender),
						}),
						"info",
					);
					return;
				case "attribute": {
					const buckets = ledger.recentProjectTotalsRange({ limit: 25 });
					const source = await ctx.ui.select(
						"Move usage from which project bucket?",
						buckets.map((row) => row.label),
					);
					if (!source) return;
					const target = await ctx.ui.select(
						"Move usage to which project bucket?",
						buckets.map((row) => row.label).filter((label) => label !== source),
					);
					if (!target) return;
					const persist = await ctx.ui.confirm(
						"Persist alias?",
						`Also map future ${source} usage to ${target}? Choose No for a one-time move.`,
					);
					if (persist) {
						state.config.projectAliases[source] = target;
						saveConfig(state.config);
					}
					const result = ledger.reattributeProject(source, target, persist);
					refreshProject(ctx.cwd);
					refreshProjectTotals();
					state.requestRender?.();
					ctx.ui.notify(
						`Attributed ${result.changedRows} usage event(s): ${source} → ${target}`,
						"info",
					);
					return;
				}
				case "aliases": {
					const entries = Object.entries(state.config.projectAliases);
					ctx.ui.notify(
						entries.length === 0
							? "No usage aliases configured."
							: [
									"Usage aliases",
									...entries.map(([from, to]) => `- ${from} → ${to}`),
								].join("\n"),
						"info",
					);
					return;
				}
				case "unalias": {
					const key = normalizeProjectKey(rest.join(" "));
					if (!key) {
						ctx.ui.notify("Usage: /usage unalias <source-project>", "error");
						return;
					}
					if (state.config.projectAliases[key]) {
						delete state.config.projectAliases[key];
						saveConfig(state.config);
						ctx.ui.notify(`Removed usage alias for ${key}.`, "info");
					} else {
						ctx.ui.notify(`No usage alias configured for ${key}.`, "warning");
					}
					return;
				}
				case "undo": {
					const op = rest[0] ? Number.parseInt(rest[0], 10) : undefined;
					const result = ledger.undoAttribution(
						Number.isFinite(op) ? op : undefined,
					);
					if (!result) {
						ctx.ui.notify(
							"No attribution operation available to undo.",
							"warning",
						);
						return;
					}
					if (
						result.persistAlias &&
						state.config.projectAliases[result.to] === result.from
					) {
						delete state.config.projectAliases[result.to];
						saveConfig(state.config);
					}
					refreshProject(ctx.cwd);
					refreshProjectTotals();
					state.requestRender?.();
					const aliasUndoNote = result.persistAlias
						? "\nRemoved persisted alias created by the original operation."
						: "";
					ctx.ui.notify(
						`Undid attribution operation #${result.operationId}: ${result.from} → ${result.to}\n` +
							`Moved back: ${formatTokens(result.fromBefore.totalTokens)} tokens, ${formatMoney(result.fromBefore.costTotal)}\n` +
							`Restored target: ${formatTokens(result.toAfter.totalTokens)} tokens, ${formatMoney(result.toAfter.costTotal)}` +
							aliasUndoNote,
						"info",
					);
					return;
				}
				case "display": {
					if (
						rest[0] === "project" &&
						(rest[1] === "short" || rest[1] === "full")
					) {
						state.config.display.projectLabel = rest[1];
						saveConfig(state.config);
						state.requestRender?.();
						ctx.ui.notify(`Project labels set to ${rest[1]}.`, "info");
						return;
					}
					ctx.ui.notify("Usage: /usage display project short|full", "error");
					return;
				}
				case "segments": {
					const action = rest[0];
					const requested = rest.slice(1).filter(isSegmentName);
					if (action === "list" || !action) {
						ctx.ui.notify(
							`Visible usage footer segments: ${describeSegments(state.config)}`,
							"info",
						);
						return;
					}
					if (action === "only" && requested.length > 0) {
						state.config.segments = requested;
						state.config.display.hideThinking = !requested.includes("thinking");
					} else if (action === "hide") {
						state.config.segments = state.config.segments.filter(
							(s) => !requested.includes(s),
						);
						if (requested.includes("thinking"))
							state.config.display.hideThinking = true;
					} else if (action === "show") {
						state.config.segments = [
							...new Set([...state.config.segments, ...requested]),
						];
						if (requested.includes("thinking"))
							state.config.display.hideThinking = false;
					} else if (action === "second-line")
						state.config.showSecondLine = rest[1] !== "off";
					else {
						ctx.ui.notify(
							"Usage: /usage segments list|only|show|hide <segments> or /usage segments second-line on|off",
							"error",
						);
						return;
					}
					saveConfig(state.config);
					state.requestRender?.();
					ctx.ui.notify(
						`Visible usage footer segments: ${describeSegments(state.config)}`,
						"info",
					);
					return;
				}
				case "db":
					ctx.ui.notify(`Usage ledger: ${ledger.path}`, "info");
					return;
				case "config":
					ctx.ui.notify(
						`Usage config: ${CONFIG_PATH}\nAliases: ${JSON.stringify(state.config.projectAliases)}\nDisplay: ${JSON.stringify(state.config.display)}\nPrivacy: ${JSON.stringify(state.config.privacy)}`,
						"info",
					);
					return;
				case "help":
				default:
					ctx.ui.notify(
						"/usage session — current session totals\n" +
							"/usage today|yesterday|week|month|since <day>|between <a> <b> — project rollups\n" +
							"/usage project [project] [range] — project totals\n" +
							"/usage projects|models|sessions [range] — top rollups\n" +
							"/usage summary [range] — combined total and model breakdown\n" +
							"/usage move <from> to <to> — one-time merge without alias\n" +
							"/usage change <from> to <to> — merge and persist future alias\n" +
							"/usage aliases|unalias <from>|undo [id] — manage attribution\n" +
							"/usage attribute — interactive attribution picker\n" +
							"/usage doctor — storage/config diagnostic\n" +
							"/usage display project short|full — project label display\n" +
							"/usage segments list|only|show|hide <segments> — customize footer (including thinking)\n" +
							"/usage backup — copy the SQLite ledger to backups/\n" +
							"/usage export [limit] — export recent rows to JSON\n" +
							"/usage memory-summary [range] — compact rollup text\n" +
							"/usage db|config — show storage paths",
						"info",
					);
			}
		},
	});
}
