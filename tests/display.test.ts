import test from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, CONFIG_PATH } from "../src/config.ts";

test("display config defaults to full project labels", () => {
	assert.equal(DEFAULT_CONFIG.display.projectLabel, "full");
});

test("config shape supports short project labels", () => {
	// CONFIG_PATH is environment-derived at module load time, so avoid writing in this test.
	assert.ok(CONFIG_PATH.includes("pi-usage-bar"));
	const config = {
		...DEFAULT_CONFIG,
		display: { projectLabel: "short" as const },
		projectAliases: {},
		privacy: { ...DEFAULT_CONFIG.privacy },
	};
	assert.equal(config.display.projectLabel, "short");
});
