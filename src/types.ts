export interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	totalTokens: number;
	costInput: number;
	costOutput: number;
	costCacheRead: number;
	costCacheWrite: number;
	costTotal: number;
}

export interface UsagePricing {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	source: string;
}

export interface UsageEvent {
	id: string;
	timestamp: string;
	day: string;
	sessionId: string;
	sessionFile?: string;
	sessionName?: string;
	messageId?: string;
	cwd: string;
	gitRoot?: string;
	gitBranch?: string;
	gitRemote?: string;
	projectKey: string;
	provider: string;
	model: string;
	usage: UsageTotals;
	pricing?: UsagePricing;
}

export interface ProjectInfo {
	cwd: string;
	gitRoot?: string;
	gitBranch?: string;
	gitRemote?: string;
	projectKey: string;
}

export type SegmentName =
	| "model"
	| "context"
	| "session"
	| "cost"
	| "project"
	| "extensions"
	| "thinking";

export interface UsagePrivacyConfig {
	storeCwd: boolean;
	storeGitRemote: boolean;
	storeSessionFile: boolean;
	storeSessionName: boolean;
	hashSessionIds: boolean;
}

export interface UsageDisplayConfig {
	projectLabel: "full" | "short";
	hideThinking: boolean;
}

export interface UsageBarConfig {
	segments: SegmentName[];
	warningThreshold: number;
	errorThreshold: number;
	showSecondLine: boolean;
	projectAliases: Record<string, string>;
	display: UsageDisplayConfig;
	privacy: UsagePrivacyConfig;
}

export interface UsageSummaryRow {
	label: string;
	totals: UsageTotals;
	/** Display/reporting cost: list-price recalculation when pricing exists, otherwise recorded cost. */
	displayCost?: number;
	pricing?: UsagePricing;
}

export interface UsageRange {
	label: string;
	startDay?: string;
	endDay?: string;
}

export interface UsageQueryOptions {
	range?: UsageRange;
	projectKey?: string;
	limit?: number;
}

export interface ReattributionResult {
	operationId: number;
	from: string;
	to: string;
	persistAlias: boolean;
	changedRows: number;
	fromBefore: UsageTotals;
	toBefore: UsageTotals;
	toAfter: UsageTotals;
}

export interface DoctorResult {
	checks: Array<{ status: "ok" | "warn" | "error"; message: string }>;
}
