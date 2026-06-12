import type { UsageRange } from "./types.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

export function todayString(date = new Date()): string {
	return date.toISOString().slice(0, 10);
}

export function addDays(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00.000Z`);
	return todayString(new Date(date.getTime() + days * DAY_MS));
}

export function parseUsageRange(words: string[], now = new Date()): UsageRange {
	const [first, second, third] = words;
	const today = todayString(now);
	if (!first || first === "all") return { label: "all time" };
	if (first === "today")
		return { label: `today (${today})`, startDay: today, endDay: today };
	if (first === "yesterday") {
		const day = addDays(today, -1);
		return { label: `yesterday (${day})`, startDay: day, endDay: day };
	}
	if (first === "week")
		return {
			label: "last 7 days",
			startDay: addDays(today, -6),
			endDay: today,
		};
	if (first === "month")
		return {
			label: "last 30 days",
			startDay: addDays(today, -29),
			endDay: today,
		};
	if (first === "since" && second && isDay(second)) {
		return { label: `since ${second}`, startDay: second, endDay: today };
	}
	if (first === "between" && second && third && isDay(second) && isDay(third)) {
		return { label: `${second}..${third}`, startDay: second, endDay: third };
	}
	if (isDay(first)) return { label: first, startDay: first, endDay: first };
	return { label: "all time" };
}

export function rangeWhere(range: UsageRange | undefined): {
	clause: string;
	params: string[];
} {
	if (!range?.startDay && !range?.endDay) return { clause: "", params: [] };
	if (range.startDay && range.endDay) {
		return {
			clause: "day BETWEEN ? AND ?",
			params: [range.startDay, range.endDay],
		};
	}
	if (range.startDay) return { clause: "day >= ?", params: [range.startDay] };
	return { clause: "day <= ?", params: [range.endDay ?? ""] };
}

function isDay(value: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(value);
}
