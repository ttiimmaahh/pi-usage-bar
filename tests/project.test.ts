import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { execFileSync } from "node:child_process";
import { DEFAULT_CONFIG } from "../src/config.ts";
import { displayProjectLabel, resolveProjectInfo } from "../src/project.ts";
import type { ProjectInfo } from "../src/types.ts";

function run(command: string, args: string[], cwd: string): void {
	execFileSync(command, args, { cwd, stdio: "ignore" });
}

test("resolveProjectInfo uses the current folder name outside git repos", () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-usage-bar-non-git-"));
	const project = resolveProjectInfo(cwd, DEFAULT_CONFIG);

	assert.equal(project.gitRoot, undefined);
	assert.equal(project.gitBranch, undefined);
	assert.equal(project.projectKey, basename(cwd));
	assert.equal(displayProjectLabel(project, DEFAULT_CONFIG), basename(cwd));
});

test("displayProjectLabel shows repo:branch for git repositories", () => {
	const cwd = mkdtempSync(join(tmpdir(), "pi-usage-bar-git-"));
	run("git", ["init", "-b", "feature/statusline"], cwd);
	run(
		"git",
		["remote", "add", "origin", "git@github.com:example/demo.git"],
		cwd,
	);

	const project = resolveProjectInfo(cwd, DEFAULT_CONFIG);

	assert.equal(project.projectKey, "example/demo");
	assert.equal(project.gitBranch, "feature/statusline");
	assert.equal(
		displayProjectLabel(project, DEFAULT_CONFIG),
		"example/demo:feature/statusline",
	);
});

test("displayProjectLabel respects short project labels", () => {
	const project: ProjectInfo = {
		cwd: "/workspace/demo",
		gitRoot: "/workspace/demo",
		gitBranch: "main",
		projectKey: "example/demo",
	};

	assert.equal(
		displayProjectLabel(project, {
			...DEFAULT_CONFIG,
			display: { ...DEFAULT_CONFIG.display, projectLabel: "short" },
		}),
		"demo:main",
	);
});
