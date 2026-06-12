import { normalizeProjectKey } from "./config.ts";
import type { SegmentName } from "./types.ts";

export type AttributionCommand = {
	from: string;
	to: string;
	persistAlias: boolean;
};

export function parseAttributionCommand(args: string): AttributionCommand | undefined {
	const trimmed = args.trim();
	const alias = trimmed.match(/^(?:change|alias)\s+(.+?)\s+(?:to|=>)\s+(.+)$/i);
	if (alias) {
		return {
			from: normalizeProjectKey(alias[1] ?? ""),
			to: normalizeProjectKey(alias[2] ?? ""),
			persistAlias: true,
		};
	}
	const move = trimmed.match(
		/^(?:move|merge)\s+(.+?)\s+(?:to|into|=>)\s+(.+)$/i,
	);
	if (move) {
		return {
			from: normalizeProjectKey(move[1] ?? ""),
			to: normalizeProjectKey(move[2] ?? ""),
			persistAlias: false,
		};
	}
	return undefined;
}

export function rangeFromSubcommand(
	subcommand: string,
	rest: string[],
): { label: string; words: string[] } {
	if (["today", "yesterday", "week", "month"].includes(subcommand)) {
		return { label: subcommand, words: [subcommand] };
	}
	if (subcommand === "since") return { label: "since", words: ["since", ...rest] };
	if (subcommand === "between") return { label: "between", words: ["between", ...rest] };
	return { label: "all", words: rest };
}

export function splitProjectAndRange(
	words: string[],
	currentProject: string,
): { projectKey: string; rangeWords: string[] } {
	const rangeWords = new Set([
		"all",
		"today",
		"yesterday",
		"week",
		"month",
		"since",
		"between",
	]);
	if (words.length === 0 || rangeWords.has(words[0] ?? "")) {
		return { projectKey: currentProject, rangeWords: words };
	}
	return {
		projectKey: normalizeProjectKey(words[0] ?? currentProject),
		rangeWords: words.slice(1),
	};
}

export function isSegmentName(value: string): value is SegmentName {
	return ["model", "context", "session", "cost", "project", "extensions"].includes(value);
}
