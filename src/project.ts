import { execFileSync } from "node:child_process";
import { basename, relative } from "node:path";
import { resolveAlias } from "./config.ts";
import type { ProjectInfo, UsageBarConfig } from "./types.ts";

const GITROOT_MARKER = "/Developer/gitroot/";

function git(args: string[], cwd: string): string | undefined {
	try {
		return (
			execFileSync("git", args, {
				cwd,
				encoding: "utf8",
				stdio: ["ignore", "pipe", "ignore"],
			}).trim() || undefined
		);
	} catch {
		return undefined;
	}
}

function projectFromRemote(remote: string | undefined): string | undefined {
	if (!remote) return undefined;
	const cleaned = remote
		.replace(/^git@github\.com:/, "")
		.replace(/^https:\/\/github\.com\//, "")
		.replace(/\.git$/, "")
		.trim();
	return cleaned.includes("/") ? cleaned : undefined;
}

function projectFromGitroot(path: string): string | undefined {
	const index = path.indexOf(GITROOT_MARKER);
	if (index < 0) return undefined;
	const tail = path.slice(index + GITROOT_MARKER.length);
	const parts = tail.split("/").filter(Boolean);
	if (parts.length >= 2) return `${parts[0]}/${parts[1]}`;
	if (parts.length === 1) return `${parts[0]}/_root`;
	return undefined;
}

export function resolveProjectInfo(
	cwd: string,
	config?: UsageBarConfig,
): ProjectInfo {
	const gitRoot = git(["rev-parse", "--show-toplevel"], cwd);
	const gitBranch = git(["branch", "--show-current"], cwd);
	const gitRemote = git(["config", "--get", "remote.origin.url"], cwd);
	const rootOrCwd = gitRoot ?? cwd;
	const rawProjectKey =
		projectFromRemote(gitRemote) ??
		projectFromGitroot(rootOrCwd) ??
		basename(rootOrCwd) ??
		"unknown";
	const projectKey = config
		? resolveAlias(rawProjectKey, config)
		: rawProjectKey;

	return {
		cwd,
		gitRoot,
		gitBranch,
		gitRemote,
		projectKey,
	};
}

export function compactPath(path: string, cwd: string): string {
	const rel = relative(cwd, path);
	return rel && !rel.startsWith("..") ? rel : path;
}
