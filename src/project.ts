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

function stripGitSuffix(value: string): string {
	return value.endsWith(".git") ? value.slice(0, -4) : value;
}

function cleanRemotePart(value: string): string {
	const stripped = stripGitSuffix(value);
	try {
		return decodeURIComponent(stripped);
	} catch {
		return stripped;
	}
}

function projectFromRemote(remote: string | undefined): string | undefined {
	if (!remote) return undefined;
	const trimmed = remote.trim();
	const azureSsh = trimmed.match(
		/^git@ssh\.dev\.azure\.com:v3\/([^/]+)\/([^/]+)\/([^/]+)$/,
	);
	if (azureSsh)
		return `${cleanRemotePart(azureSsh[1])}/${cleanRemotePart(azureSsh[3])}`;
	const azureHttps = trimmed.match(
		/^https:\/\/(?:[^/@]+@)?dev\.azure\.com\/([^/]+)\/([^/]+)\/_git\/([^/]+)$/,
	);
	if (azureHttps)
		return `${cleanRemotePart(azureHttps[1])}/${cleanRemotePart(azureHttps[3])}`;
	const githubSsh = trimmed.match(/^git@github\.com:([^/]+)\/([^/]+)$/);
	if (githubSsh)
		return `${cleanRemotePart(githubSsh[1])}/${cleanRemotePart(githubSsh[2])}`;
	const githubHttps = trimmed.match(
		/^https:\/\/github\.com\/([^/]+)\/([^/]+)$/,
	);
	if (githubHttps)
		return `${cleanRemotePart(githubHttps[1])}/${cleanRemotePart(githubHttps[2])}`;
	return undefined;
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
	const rawProjectKey = gitRoot
		? (projectFromRemote(gitRemote) ??
			projectFromGitroot(gitRoot) ??
			basename(gitRoot) ??
			"unknown")
		: (basename(cwd) ?? "unknown");
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

export function displayProjectKey(
	projectKey: string,
	config: UsageBarConfig,
): string {
	if (config.display.projectLabel === "full") return projectKey;
	return projectKey.split("/").filter(Boolean).pop() ?? projectKey;
}

export function displayProjectLabel(
	project: ProjectInfo,
	config: UsageBarConfig,
): string {
	const label = displayProjectKey(project.projectKey, config);
	if (!project.gitRoot || !project.gitBranch) return label;
	return `${label}:${project.gitBranch}`;
}

export function compactPath(path: string, cwd: string): string {
	const rel = relative(cwd, path);
	return rel && !rel.startsWith("..") ? rel : path;
}
