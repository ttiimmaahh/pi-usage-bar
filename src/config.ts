import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { SegmentName, UsageBarConfig } from "./types.ts";

export const CONFIG_PATH =
	process.env.PI_USAGE_BAR_CONFIG ??
	join(getAgentDir(), "pi-usage-bar", "config.json");

const ALL_SEGMENTS: readonly SegmentName[] = [
	"model",
	"context",
	"session",
	"cost",
	"project",
	"extensions",
	"thinking",
];

export const DEFAULT_CONFIG: UsageBarConfig = {
	segments: [
		"model",
		"context",
		"session",
		"cost",
		"project",
		"extensions",
		"thinking",
	],
	warningThreshold: 70,
	errorThreshold: 90,
	showSecondLine: true,
	projectAliases: {},
	display: {
		projectLabel: "full",
		hideThinking: false,
	},
	privacy: {
		storeCwd: true,
		storeGitRemote: true,
		storeSessionFile: true,
		storeSessionName: true,
		hashSessionIds: false,
	},
};

export function isSegmentName(value: string): value is SegmentName {
	return (ALL_SEGMENTS as readonly string[]).includes(value);
}

export function loadConfig(): UsageBarConfig {
	try {
		const raw = JSON.parse(
			readFileSync(CONFIG_PATH, "utf8"),
		) as Partial<UsageBarConfig>;
		return normalizeConfig(raw);
	} catch {
		return {
			...DEFAULT_CONFIG,
			projectAliases: {},
			display: { ...DEFAULT_CONFIG.display },
			privacy: { ...DEFAULT_CONFIG.privacy },
		};
	}
}

export function saveConfig(config: UsageBarConfig): void {
	mkdirSync(dirname(CONFIG_PATH), { recursive: true });
	writeFileSync(
		CONFIG_PATH,
		`${JSON.stringify(normalizeConfig(config), null, "\t")}\n`,
		"utf8",
	);
}

export function normalizeProjectKey(value: string): string {
	return value.trim().replace(/\s+/g, "-");
}

export function resolveAlias(
	projectKey: string,
	config: UsageBarConfig,
): string {
	let current = projectKey;
	const seen = new Set<string>();
	while (!seen.has(current)) {
		seen.add(current);
		const next = config.projectAliases[current];
		if (!next || next === current) return current;
		current = next;
	}
	return current;
}

function normalizeConfig(raw: Partial<UsageBarConfig>): UsageBarConfig {
	const segments = Array.isArray(raw.segments)
		? raw.segments.filter(
				(segment): segment is SegmentName =>
					typeof segment === "string" && isSegmentName(segment),
			)
		: DEFAULT_CONFIG.segments;
	const displayRaw: Partial<UsageBarConfig["display"]> =
		raw.display && typeof raw.display === "object" ? raw.display : {};
	const hideThinking =
		typeof displayRaw.hideThinking === "boolean"
			? displayRaw.hideThinking
			: DEFAULT_CONFIG.display.hideThinking;
	const normalizedSegments = normalizeSegments(segments, hideThinking);
	const warningThreshold = validPercent(raw.warningThreshold)
		? raw.warningThreshold
		: DEFAULT_CONFIG.warningThreshold;
	const errorThreshold =
		validPercent(raw.errorThreshold) && raw.errorThreshold > warningThreshold
			? raw.errorThreshold
			: DEFAULT_CONFIG.errorThreshold;
	const aliases: Record<string, string> = {};
	if (raw.projectAliases && typeof raw.projectAliases === "object") {
		for (const [from, to] of Object.entries(raw.projectAliases)) {
			if (typeof to !== "string") continue;
			const normalizedFrom = normalizeProjectKey(from);
			const normalizedTo = normalizeProjectKey(to);
			if (normalizedFrom && normalizedTo)
				aliases[normalizedFrom] = normalizedTo;
		}
	}
	const privacyRaw: Partial<UsageBarConfig["privacy"]> =
		raw.privacy && typeof raw.privacy === "object" ? raw.privacy : {};
	return {
		segments: normalizedSegments,
		warningThreshold,
		errorThreshold,
		showSecondLine: raw.showSecondLine ?? DEFAULT_CONFIG.showSecondLine,
		projectAliases: aliases,
		display: {
			projectLabel:
				displayRaw.projectLabel === "short" ||
				displayRaw.projectLabel === "full"
					? displayRaw.projectLabel
					: DEFAULT_CONFIG.display.projectLabel,
			hideThinking,
		},
		privacy: {
			storeCwd: privacyRaw.storeCwd ?? DEFAULT_CONFIG.privacy.storeCwd,
			storeGitRemote:
				privacyRaw.storeGitRemote ?? DEFAULT_CONFIG.privacy.storeGitRemote,
			storeSessionFile:
				privacyRaw.storeSessionFile ?? DEFAULT_CONFIG.privacy.storeSessionFile,
			storeSessionName:
				privacyRaw.storeSessionName ?? DEFAULT_CONFIG.privacy.storeSessionName,
			hashSessionIds:
				privacyRaw.hashSessionIds ?? DEFAULT_CONFIG.privacy.hashSessionIds,
		},
	};
}

function validPercent(value: unknown): value is number {
	return (
		typeof value === "number" &&
		Number.isFinite(value) &&
		value >= 0 &&
		value <= 100
	);
}

function normalizeSegments(
	segments: SegmentName[],
	hideThinking: boolean,
): SegmentName[] {
	const normalized =
		segments.length > 0 ? [...new Set(segments)] : DEFAULT_CONFIG.segments;
	if (hideThinking)
		return normalized.filter((segment) => segment !== "thinking");
	return normalized.includes("thinking")
		? normalized
		: [...normalized, "thinking"];
}
