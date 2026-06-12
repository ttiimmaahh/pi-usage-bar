import test from "node:test";
import assert from "node:assert/strict";
import {
	parseAttributionCommand,
	rangeFromSubcommand,
	splitProjectAndRange,
} from "../src/commands.ts";

test("parseAttributionCommand distinguishes persistent aliases from one-time moves", () => {
	assert.deepEqual(
		parseAttributionCommand("move personal/_root to personal/pi-usage-bar"),
		{
			from: "personal/_root",
			to: "personal/pi-usage-bar",
			persistAlias: false,
		},
	);
	assert.deepEqual(
		parseAttributionCommand("merge personal/_root into personal/pi-usage-bar"),
		{
			from: "personal/_root",
			to: "personal/pi-usage-bar",
			persistAlias: false,
		},
	);
	assert.deepEqual(
		parseAttributionCommand("alias personal/_root to personal/pi-usage-bar"),
		{
			from: "personal/_root",
			to: "personal/pi-usage-bar",
			persistAlias: true,
		},
	);
});

test("splitProjectAndRange parses project-specific range commands", () => {
	assert.deepEqual(
		splitProjectAndRange(["personal/pi-usage-bar", "week"], "current"),
		{
			projectKey: "personal/pi-usage-bar",
			rangeWords: ["week"],
		},
	);
	assert.deepEqual(splitProjectAndRange(["week"], "current"), {
		projectKey: "current",
		rangeWords: ["week"],
	});
});

test("rangeFromSubcommand maps top-level date commands", () => {
	assert.deepEqual(rangeFromSubcommand("week", []), {
		label: "week",
		words: ["week"],
	});
	assert.deepEqual(rangeFromSubcommand("since", ["2026-06-01"]), {
		label: "since",
		words: ["since", "2026-06-01"],
	});
});
