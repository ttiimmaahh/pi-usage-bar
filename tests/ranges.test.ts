import test from "node:test";
import assert from "node:assert/strict";
import { addDays, parseUsageRange, todayString } from "../src/ranges.ts";

const now = new Date("2026-06-12T12:00:00.000Z");

test("parseUsageRange handles named ranges", () => {
	assert.deepEqual(parseUsageRange(["today"], now), {
		label: "today (2026-06-12)",
		startDay: "2026-06-12",
		endDay: "2026-06-12",
	});
	assert.deepEqual(parseUsageRange(["yesterday"], now), {
		label: "yesterday (2026-06-11)",
		startDay: "2026-06-11",
		endDay: "2026-06-11",
	});
	assert.deepEqual(parseUsageRange(["week"], now), {
		label: "last 7 days",
		startDay: "2026-06-06",
		endDay: "2026-06-12",
	});
});

test("parseUsageRange handles explicit ranges", () => {
	assert.deepEqual(parseUsageRange(["since", "2026-06-01"], now), {
		label: "since 2026-06-01",
		startDay: "2026-06-01",
		endDay: "2026-06-12",
	});
	assert.deepEqual(
		parseUsageRange(["between", "2026-06-01", "2026-06-10"], now),
		{
			label: "2026-06-01..2026-06-10",
			startDay: "2026-06-01",
			endDay: "2026-06-10",
		},
	);
});

test("date helpers are stable", () => {
	assert.equal(todayString(now), "2026-06-12");
	assert.equal(addDays("2026-06-12", -6), "2026-06-06");
});
