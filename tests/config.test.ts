import test from "node:test";
import assert from "node:assert/strict";
import { normalizeProjectKey, resolveAlias } from "../src/config.ts";
import type { UsageBarConfig } from "../src/types.ts";

const config: UsageBarConfig = {
	segments: ["model", "context", "session", "cost", "project", "extensions"],
	warningThreshold: 70,
	errorThreshold: 90,
	showSecondLine: true,
	display: { projectLabel: "full" },
	projectAliases: {
		"personal/_root": "personal/pi-usage-bar",
		"old name": "normalized-target",
	},
	privacy: {
		storeCwd: true,
		storeGitRemote: true,
		storeSessionFile: true,
		storeSessionName: true,
		hashSessionIds: false,
	},
};

test("normalizeProjectKey trims and dash-normalizes whitespace", () => {
	assert.equal(
		normalizeProjectKey("  personal pi usage bar  "),
		"personal-pi-usage-bar",
	);
});

test("resolveAlias follows configured aliases", () => {
	assert.equal(resolveAlias("personal/_root", config), "personal/pi-usage-bar");
	assert.equal(resolveAlias("unknown", config), "unknown");
});
