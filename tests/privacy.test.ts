import test from "node:test";
import assert from "node:assert/strict";
import { makeUsageEvent } from "../src/usage-events.ts";
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ProjectInfo, UsageBarConfig } from "../src/types.ts";

const message = {
	role: "assistant",
	content: [],
	api: "test",
	provider: "test-provider",
	model: "test-model",
	stopReason: "stop",
	timestamp: Date.parse("2026-06-12T00:00:00.000Z"),
	usage: {
		input: 10,
		output: 5,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 15,
		cost: {
			input: 0.01,
			output: 0.02,
			cacheRead: 0,
			cacheWrite: 0,
			total: 0.03,
		},
	},
} as AssistantMessage;

const project: ProjectInfo = {
	cwd: "/secret/path",
	gitRoot: "/secret/path",
	gitBranch: "main",
	gitRemote: "git@github.com:example/private.git",
	projectKey: "example/private",
};

const session = {
	getSessionId: () => "session-id",
	getSessionFile: () => "/secret/session.jsonl",
	getSessionName: () => "secret session",
} as Parameters<typeof makeUsageEvent>[2];

const config: UsageBarConfig = {
	segments: ["model"],
	warningThreshold: 70,
	errorThreshold: 90,
	showSecondLine: true,
	display: { projectLabel: "full", hideThinking: false },
	projectAliases: {},
	privacy: {
		storeCwd: false,
		storeGitRemote: false,
		storeSessionFile: false,
		storeSessionName: false,
		hashSessionIds: true,
	},
};

test("makeUsageEvent honors privacy config", () => {
	const event = makeUsageEvent(message, project, session, config);
	assert.equal(event.cwd, "");
	assert.equal(event.gitRoot, undefined);
	assert.equal(event.gitRemote, undefined);
	assert.equal(event.sessionFile, undefined);
	assert.equal(event.sessionName, undefined);
	assert.notEqual(event.sessionId, "session-id");
	assert.equal(event.sessionId.length, 32);
});
