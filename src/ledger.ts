import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { rangeWhere } from "./ranges.ts";
import type {
	ReattributionResult,
	UsageEvent,
	UsageQueryOptions,
	UsageRange,
	UsageSummaryRow,
	UsageTotals,
} from "./types.ts";

export const DEFAULT_LEDGER_PATH =
	process.env.PI_USAGE_BAR_DB ?? join(getAgentDir(), "usage", "usage.sqlite");

const CURRENT_SCHEMA_VERSION = 5;

type Migration = { version: number; sql: string };

const MIGRATIONS: Migration[] = [
	{
		version: 1,
		sql: `
			CREATE TABLE IF NOT EXISTS usage_events (
				id TEXT PRIMARY KEY,
				timestamp TEXT NOT NULL,
				day TEXT NOT NULL,
				session_id TEXT NOT NULL,
				session_file TEXT,
				session_name TEXT,
				message_id TEXT,
				cwd TEXT NOT NULL,
				git_root TEXT,
				git_branch TEXT,
				git_remote TEXT,
				project_key TEXT NOT NULL,
				provider TEXT NOT NULL,
				model TEXT NOT NULL,
				input_tokens INTEGER NOT NULL,
				output_tokens INTEGER NOT NULL,
				cache_read_tokens INTEGER NOT NULL,
				cache_write_tokens INTEGER NOT NULL,
				total_tokens INTEGER NOT NULL,
				cost_input REAL NOT NULL,
				cost_output REAL NOT NULL,
				cost_cache_read REAL NOT NULL,
				cost_cache_write REAL NOT NULL,
				cost_total REAL NOT NULL
			);
			CREATE TABLE IF NOT EXISTS usage_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id);
			CREATE INDEX IF NOT EXISTS idx_usage_events_project_day ON usage_events(project_key, day);
			CREATE INDEX IF NOT EXISTS idx_usage_events_day ON usage_events(day);
			CREATE INDEX IF NOT EXISTS idx_usage_events_model_day ON usage_events(provider, model, day);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_usage_events_natural_unique
				ON usage_events(session_id, timestamp, provider, model, total_tokens);
		`,
	},
	{
		version: 2,
		sql: `
			CREATE TABLE IF NOT EXISTS usage_attribution_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				timestamp TEXT NOT NULL,
				from_project TEXT NOT NULL,
				to_project TEXT NOT NULL,
				persist_alias INTEGER NOT NULL,
				changed_rows INTEGER DEFAULT 0,
				undone_at TEXT,
				undo_changed_rows INTEGER DEFAULT 0
			);
		`,
	},
	{
		version: 3,
		sql: `
			CREATE INDEX IF NOT EXISTS idx_usage_attribution_history_undone
				ON usage_attribution_history(undone_at, id);
		`,
	},
	{
		version: 4,
		sql: `
			CREATE TABLE IF NOT EXISTS usage_attribution_rows (
				operation_id INTEGER NOT NULL,
				event_id TEXT NOT NULL,
				PRIMARY KEY (operation_id, event_id),
				FOREIGN KEY (operation_id) REFERENCES usage_attribution_history(id),
				FOREIGN KEY (event_id) REFERENCES usage_events(id)
			);
			CREATE INDEX IF NOT EXISTS idx_usage_attribution_rows_event
				ON usage_attribution_rows(event_id);
		`,
	},
	{
		version: 5,
		sql: `
			ALTER TABLE usage_events ADD COLUMN price_input REAL;
			ALTER TABLE usage_events ADD COLUMN price_output REAL;
			ALTER TABLE usage_events ADD COLUMN price_cache_read REAL;
			ALTER TABLE usage_events ADD COLUMN price_cache_write REAL;
			ALTER TABLE usage_events ADD COLUMN price_source TEXT;
		`,
	},
];

export function emptyTotals(): UsageTotals {
	return {
		input: 0,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens: 0,
		costInput: 0,
		costOutput: 0,
		costCacheRead: 0,
		costCacheWrite: 0,
		costTotal: 0,
	};
}

export function addTotals(a: UsageTotals, b: UsageTotals): UsageTotals {
	return {
		input: a.input + b.input,
		output: a.output + b.output,
		cacheRead: a.cacheRead + b.cacheRead,
		cacheWrite: a.cacheWrite + b.cacheWrite,
		totalTokens: a.totalTokens + b.totalTokens,
		costInput: a.costInput + b.costInput,
		costOutput: a.costOutput + b.costOutput,
		costCacheRead: a.costCacheRead + b.costCacheRead,
		costCacheWrite: a.costCacheWrite + b.costCacheWrite,
		costTotal: a.costTotal + b.costTotal,
	};
}

export class UsageLedger {
	private readonly db: DatabaseSync;

	constructor(readonly path = DEFAULT_LEDGER_PATH) {
		mkdirSync(dirname(path), { recursive: true });
		this.db = new DatabaseSync(path);
		this.db.exec("PRAGMA journal_mode = WAL");
		this.db.exec("PRAGMA synchronous = NORMAL");
		this.migrate();
	}

	close(): void {
		this.db.close();
	}

	schemaVersion(): number {
		return this.getSchemaVersion();
	}

	insertEvent(event: UsageEvent): boolean {
		const result = this.db
			.prepare(`
				INSERT OR IGNORE INTO usage_events (
					id, timestamp, day, session_id, session_file, session_name, message_id,
					cwd, git_root, git_branch, git_remote, project_key, provider, model,
					input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens,
					cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
					price_input, price_output, price_cache_read, price_cache_write, price_source
				) VALUES (
					$id, $timestamp, $day, $sessionId, $sessionFile, $sessionName, $messageId,
					$cwd, $gitRoot, $gitBranch, $gitRemote, $projectKey, $provider, $model,
					$input, $output, $cacheRead, $cacheWrite, $totalTokens,
					$costInput, $costOutput, $costCacheRead, $costCacheWrite, $costTotal,
					$priceInput, $priceOutput, $priceCacheRead, $priceCacheWrite, $priceSource
				)
			`)
			.run({
				$id: event.id,
				$timestamp: event.timestamp,
				$day: event.day,
				$sessionId: event.sessionId,
				$sessionFile: event.sessionFile ?? null,
				$sessionName: event.sessionName ?? null,
				$messageId: event.messageId ?? null,
				$cwd: event.cwd,
				$gitRoot: event.gitRoot ?? null,
				$gitBranch: event.gitBranch ?? null,
				$gitRemote: event.gitRemote ?? null,
				$projectKey: event.projectKey,
				$provider: event.provider,
				$model: event.model,
				$input: event.usage.input,
				$output: event.usage.output,
				$cacheRead: event.usage.cacheRead,
				$cacheWrite: event.usage.cacheWrite,
				$totalTokens: event.usage.totalTokens,
				$costInput: event.usage.costInput,
				$costOutput: event.usage.costOutput,
				$costCacheRead: event.usage.costCacheRead,
				$costCacheWrite: event.usage.costCacheWrite,
				$costTotal: event.usage.costTotal,
				$priceInput: event.pricing?.input ?? null,
				$priceOutput: event.pricing?.output ?? null,
				$priceCacheRead: event.pricing?.cacheRead ?? null,
				$priceCacheWrite: event.pricing?.cacheWrite ?? null,
				$priceSource: event.pricing?.source ?? null,
			});
		return Number(result.changes) > 0;
	}

	totalsForSession(sessionId: string): UsageTotals {
		return totalsFromRow(
			this.db
				.prepare(`
					SELECT ${TOTALS_SELECT}
					FROM usage_events WHERE session_id = ?
				`)
				.get(sessionId),
		);
	}

	totalsForRange(range?: UsageRange): UsageTotals {
		const rangeFilter = rangeWhere(range);
		const where = rangeFilter.clause ? `WHERE ${rangeFilter.clause}` : "";
		return totalsFromRow(
			this.db
				.prepare(`
					SELECT ${TOTALS_SELECT}
					FROM usage_events ${where}
				`)
				.get(...rangeFilter.params),
		);
	}

	totalsForProject(projectKey: string, day?: string): UsageTotals {
		return this.totalsForProjectRange(
			projectKey,
			day ? { label: day, startDay: day, endDay: day } : undefined,
		);
	}

	totalsForProjectRange(projectKey: string, range?: UsageRange): UsageTotals {
		const rangeFilter = rangeWhere(range);
		const filters = ["project_key = ?", rangeFilter.clause].filter(Boolean);
		const where = filters.join(" AND ");
		const params = [projectKey, ...rangeFilter.params];
		return totalsFromRow(
			this.db
				.prepare(`
					SELECT ${TOTALS_SELECT}
					FROM usage_events WHERE ${where}
				`)
				.get(...params),
		);
	}

	recentProjectTotals(day?: string, limit = 10): UsageSummaryRow[] {
		return this.groupedTotals("project_key", {
			range: day ? { label: day, startDay: day, endDay: day } : undefined,
			limit,
		});
	}

	recentProjectTotalsRange(options: UsageQueryOptions = {}): UsageSummaryRow[] {
		return this.groupedTotals("project_key", options);
	}

	recentModelTotals(day?: string, limit = 10): UsageSummaryRow[] {
		return this.groupedTotals("provider || '/' || model", {
			range: day ? { label: day, startDay: day, endDay: day } : undefined,
			limit,
		});
	}

	recentModelTotalsRange(options: UsageQueryOptions = {}): UsageSummaryRow[] {
		return this.groupedTotals("provider || '/' || model", options);
	}

	recentSessionTotals(day?: string, limit = 10): UsageSummaryRow[] {
		return this.groupedTotals(
			"COALESCE(session_name, session_id) || ' · ' || COALESCE(project_key, 'unknown')",
			{
				range: day ? { label: day, startDay: day, endDay: day } : undefined,
				limit,
			},
		);
	}

	recentSessionTotalsRange(options: UsageQueryOptions = {}): UsageSummaryRow[] {
		return this.groupedTotals(
			"COALESCE(session_name, session_id) || ' · ' || COALESCE(project_key, 'unknown')",
			options,
		);
	}

	reattributeProject(
		from: string,
		to: string,
		persistAlias = false,
	): ReattributionResult {
		const fromBefore = this.totalsForProject(from);
		const toBefore = this.totalsForProject(to);
		const movedIds = this.eventIdsForProject(from);
		const operationId = this.createAttributionOperation(
			from,
			to,
			persistAlias,
			movedIds,
		);
		const result = this.db
			.prepare("UPDATE usage_events SET project_key = ? WHERE project_key = ?")
			.run(to, from);
		const toAfter = this.totalsForProject(to);
		this.db
			.prepare(
				"UPDATE usage_attribution_history SET changed_rows = ? WHERE id = ?",
			)
			.run(Number(result.changes), operationId);
		return {
			operationId,
			from,
			to,
			persistAlias,
			changedRows: Number(result.changes),
			fromBefore,
			toBefore,
			toAfter,
		};
	}

	undoAttribution(operationId?: number): ReattributionResult | undefined {
		const row = this.db
			.prepare(`
				SELECT * FROM usage_attribution_history
				WHERE undone_at IS NULL ${operationId ? "AND id = ?" : ""}
				ORDER BY id DESC LIMIT 1
			`)
			.get(...(operationId ? [operationId] : [])) as
			| Record<string, unknown>
			| undefined;
		if (!row) return undefined;
		const id = Number(row.id);
		const from = String(row.to_project);
		const to = String(row.from_project);
		const fromBefore = this.totalsForProject(from);
		const toBefore = this.totalsForProject(to);
		const result = this.db
			.prepare(`
				UPDATE usage_events
				SET project_key = ?
				WHERE project_key = ?
				  AND id IN (SELECT event_id FROM usage_attribution_rows WHERE operation_id = ?)
			`)
			.run(to, from, id);
		this.db
			.prepare(
				"UPDATE usage_attribution_history SET undone_at = ?, undo_changed_rows = ? WHERE id = ?",
			)
			.run(new Date().toISOString(), Number(result.changes), id);
		return {
			operationId: id,
			from,
			to,
			persistAlias: Number(row.persist_alias ?? 0) === 1,
			changedRows: Number(result.changes),
			fromBefore,
			toBefore,
			toAfter: this.totalsForProject(to),
		};
	}

	exportEvents(limit = 1000): unknown[] {
		return this.db
			.prepare(`
				SELECT * FROM usage_events
				ORDER BY timestamp DESC
				LIMIT ?
			`)
			.all(limit);
	}

	rowCount(): number {
		const row = this.db
			.prepare("SELECT COUNT(*) count FROM usage_events")
			.get() as { count: number };
		return Number(row.count);
	}

	backupTo(path: string): void {
		mkdirSync(dirname(path), { recursive: true });
		const escaped = path.replace(/'/g, "''");
		this.db.exec(`VACUUM INTO '${escaped}'`);
	}

	private eventIdsForProject(projectKey: string): string[] {
		const rows = this.db
			.prepare(
				"SELECT id FROM usage_events WHERE project_key = ? ORDER BY timestamp, id",
			)
			.all(projectKey) as Array<{ id: string }>;
		return rows.map((row) => row.id);
	}

	private createAttributionOperation(
		from: string,
		to: string,
		persistAlias: boolean,
		eventIds: string[],
	): number {
		this.db.exec("BEGIN");
		try {
			const result = this.db
				.prepare(`
					INSERT INTO usage_attribution_history (timestamp, from_project, to_project, persist_alias)
					VALUES (?, ?, ?, ?)
				`)
				.run(new Date().toISOString(), from, to, persistAlias ? 1 : 0);
			const id = Number(result.lastInsertRowid);
			const insertRow = this.db.prepare(
				"INSERT OR IGNORE INTO usage_attribution_rows (operation_id, event_id) VALUES (?, ?)",
			);
			for (const eventId of eventIds) insertRow.run(id, eventId);
			this.db.exec("COMMIT");
			return id;
		} catch (error) {
			this.db.exec("ROLLBACK");
			throw error;
		}
	}

	private groupedTotals(
		groupExpression: string,
		options: UsageQueryOptions = {},
	): UsageSummaryRow[] {
		const rangeFilter = rangeWhere(options.range);
		const filters = [
			rangeFilter.clause,
			options.projectKey ? "project_key = ?" : "",
		].filter(Boolean);
		const where = filters.length > 0 ? `WHERE ${filters.join(" AND ")}` : "";
		const params = [
			...rangeFilter.params,
			...(options.projectKey ? [options.projectKey] : []),
		];
		const limit = options.limit ?? 10;
		const rows = this.db
			.prepare(`
				SELECT
					${groupExpression} label,
					${TOTALS_SELECT},
					SUM(
						CASE
							WHEN price_input IS NOT NULL AND price_output IS NOT NULL AND price_cache_read IS NOT NULL AND price_cache_write IS NOT NULL
							THEN (input_tokens / 1000000.0) * price_input
								+ (output_tokens / 1000000.0) * price_output
								+ (cache_read_tokens / 1000000.0) * price_cache_read
								+ (cache_write_tokens / 1000000.0) * price_cache_write
							ELSE cost_total
						END
					) displayCost,
					MAX(price_input) priceInput,
					MAX(price_output) priceOutput,
					MAX(price_cache_read) priceCacheRead,
					MAX(price_cache_write) priceCacheWrite,
					MAX(price_source) priceSource
				FROM usage_events
				${where}
				GROUP BY label
				ORDER BY totalTokens DESC
				LIMIT ?
			`)
			.all(...params, limit) as Array<Record<string, unknown>>;
		return rows.map((row) => ({
			label: String(row.label),
			totals: totalsFromRow(row),
			displayCost: Number(row.displayCost ?? row.costTotal ?? 0),
			pricing: pricingFromRow(row),
		}));
	}

	private migrate(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS usage_meta (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL
			);
		`);
		const currentVersion = this.getSchemaVersion();
		for (const migration of MIGRATIONS) {
			if (migration.version <= currentVersion) continue;
			this.db.exec("BEGIN");
			try {
				this.db.exec(migration.sql);
				this.setSchemaVersion(migration.version);
				this.db.exec("COMMIT");
			} catch (error) {
				this.db.exec("ROLLBACK");
				throw error;
			}
		}
		if (this.getSchemaVersion() < CURRENT_SCHEMA_VERSION) {
			this.setSchemaVersion(CURRENT_SCHEMA_VERSION);
		}
	}

	private getSchemaVersion(): number {
		try {
			const row = this.db
				.prepare("SELECT value FROM usage_meta WHERE key = 'schema_version'")
				.get() as { value?: string } | undefined;
			return Number(row?.value ?? 0);
		} catch {
			return 0;
		}
	}

	private setSchemaVersion(version: number): void {
		this.db
			.prepare(
				"INSERT OR REPLACE INTO usage_meta(key, value) VALUES ('schema_version', ?)",
			)
			.run(String(version));
	}
}

const TOTALS_SELECT = `
	COALESCE(SUM(input_tokens), 0) input,
	COALESCE(SUM(output_tokens), 0) output,
	COALESCE(SUM(cache_read_tokens), 0) cacheRead,
	COALESCE(SUM(cache_write_tokens), 0) cacheWrite,
	COALESCE(SUM(total_tokens), 0) totalTokens,
	COALESCE(SUM(cost_input), 0) costInput,
	COALESCE(SUM(cost_output), 0) costOutput,
	COALESCE(SUM(cost_cache_read), 0) costCacheRead,
	COALESCE(SUM(cost_cache_write), 0) costCacheWrite,
	COALESCE(SUM(cost_total), 0) costTotal
`;

function pricingFromRow(row: Record<string, unknown>) {
	if (
		row.priceInput === null ||
		row.priceInput === undefined ||
		row.priceOutput === null ||
		row.priceOutput === undefined ||
		row.priceCacheRead === null ||
		row.priceCacheRead === undefined ||
		row.priceCacheWrite === null ||
		row.priceCacheWrite === undefined
	) {
		return undefined;
	}
	return {
		input: Number(row.priceInput),
		output: Number(row.priceOutput),
		cacheRead: Number(row.priceCacheRead),
		cacheWrite: Number(row.priceCacheWrite),
		source: String(row.priceSource ?? "unknown"),
	};
}

function totalsFromRow(row: unknown): UsageTotals {
	if (!row || typeof row !== "object") return emptyTotals();
	const record = row as Record<string, unknown>;
	const number = (key: keyof UsageTotals): number => {
		const value = record[key];
		return typeof value === "number" ? value : Number(value ?? 0);
	};
	return {
		input: number("input"),
		output: number("output"),
		cacheRead: number("cacheRead"),
		cacheWrite: number("cacheWrite"),
		totalTokens: number("totalTokens"),
		costInput: number("costInput"),
		costOutput: number("costOutput"),
		costCacheRead: number("costCacheRead"),
		costCacheWrite: number("costCacheWrite"),
		costTotal: number("costTotal"),
	};
}
