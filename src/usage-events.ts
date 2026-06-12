import { createHash } from "node:crypto";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type {
	ProjectInfo,
	UsageBarConfig,
	UsageEvent,
	UsagePricing,
	UsageTotals,
} from "./types.ts";

export type ExtensionSession = Parameters<
	Parameters<ExtensionAPI["on"]>[1]
>[1]["sessionManager"];

export function emptyTotals(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		costInput: 0,
		costOutput: 0,
		costCacheRead: 0,
		costCacheWrite: 0,
		costTotal: 0,
	};
}

export function plus(a: UsageTotals, b: UsageTotals): UsageTotals {
	return {
		input: a.input + b.input,
		output: a.output + b.output,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		totalTokens: a.totalTokens + b.totalTokens,
		costInput: a.costInput + b.costInput,
		costOutput: a.costOutput + b.costOutput,
		costCacheRead: a.costCacheRead + b.costCacheRead,
		costCacheWrite: a.costCacheWrite + b.costCacheWrite,
		costTotal: a.costTotal + b.costTotal,
	};
}

export function usageFromMessage(message: AssistantMessage): UsageTotals {
	const usage = message.usage;
	return {
		input: usage.input ?? 0,
		output: usage.output ?? 0,
		cacheRead: usage.cacheRead ?? 0,
		cacheWrite: usage.cacheWrite ?? 0,
		totalTokens: usage.totalTokens ?? (usage.input ?? 0) + (usage.output ?? 0),
		costInput: usage.cost?.input ?? 0,
		costOutput: usage.cost?.output ?? 0,
		costCacheRead: usage.cost?.cacheRead ?? 0,
		costCacheWrite: usage.cost?.cacheWrite ?? 0,
		costTotal: usage.cost?.total ?? 0,
	};
}

export function isAssistantMessage(value: unknown): value is AssistantMessage {
	return Boolean(
		value &&
			typeof value === "object" &&
			(value as { role?: unknown }).role === "assistant" &&
			(value as { usage?: unknown }).usage,
	);
}

export function dayOf(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function eventId(sessionId: string, message: AssistantMessage): string {
	return createHash("sha256")
		.update(
			JSON.stringify({
				sessionId,
				timestamp: message.timestamp ?? null,
				provider: message.provider ?? null,
				model: message.model ?? null,
				stopReason: message.stopReason ?? null,
				usage: message.usage ?? null,
			}),
		)
		.digest("hex")
		.slice(0, 32);
}

export function makeUsageEvent(
	message: AssistantMessage,
	project: ProjectInfo,
	session: ExtensionSession,
	config?: UsageBarConfig,
	pricing?: UsagePricing,
): UsageEvent {
	const date = new Date(message.timestamp ?? Date.now());
	const rawSessionId = session.getSessionId();
	const sessionId = config?.privacy.hashSessionIds
		? createHash("sha256").update(rawSessionId).digest("hex").slice(0, 32)
		: rawSessionId;
	const id = eventId(rawSessionId, message);
	return {
		id,
		timestamp: date.toISOString(),
		day: dayOf(date),
		sessionId,
		sessionFile:
			config?.privacy.storeSessionFile === false
				? undefined
				: session.getSessionFile(),
		sessionName:
			config?.privacy.storeSessionName === false
				? undefined
				: session.getSessionName(),
		messageId: id,
		cwd: config?.privacy.storeCwd === false ? "" : project.cwd,
		gitRoot: config?.privacy.storeCwd === false ? undefined : project.gitRoot,
		gitBranch: project.gitBranch,
		gitRemote:
			config?.privacy.storeGitRemote === false ? undefined : project.gitRemote,
		projectKey: project.projectKey,
		provider: message.provider ?? "unknown",
		model: message.model ?? "unknown",
		usage: usageFromMessage(message),
		pricing,
	};
}

export function sessionUsageFromBranch(
	branch: ReturnType<ExtensionSession["getBranch"]>,
): UsageTotals {
	let total = emptyTotals();
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		if (!isAssistantMessage(entry.message)) continue;
		total = plus(total, usageFromMessage(entry.message));
	}
	return total;
}

export function usageEventsFromBranch(
	branch: ReturnType<ExtensionSession["getBranch"]>,
	project: ProjectInfo,
	session: ExtensionSession,
	config?: UsageBarConfig,
): UsageEvent[] {
	const events: UsageEvent[] = [];
	for (const entry of branch) {
		if (entry.type !== "message") continue;
		if (!isAssistantMessage(entry.message)) continue;
		events.push(makeUsageEvent(entry.message, project, session, config));
	}
	return events;
}
