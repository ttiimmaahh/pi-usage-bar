import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { UsageLedger } from "../src/ledger.ts";
import type { UsageEvent, UsageTotals } from "../src/types.ts";

function totals(
	totalTokens: number,
	costTotal = totalTokens / 1000,
): UsageTotals {
	return {
		input: totalTokens,
		output: 0,
		cacheRead: 0,
		cacheWrite: 0,
		totalTokens,
		costInput: costTotal,
		costOutput: 0,
		costCacheRead: 0,
		costCacheWrite: 0,
		costTotal,
	};
}

function event(
	id: string,
	projectKey: string,
	totalTokens: number,
): UsageEvent {
	return {
		id,
		timestamp: `2026-06-12T00:00:0${id}.000Z`,
		day: "2026-06-12",
		sessionId: "session-1",
		cwd: "/tmp/project",
		projectKey,
		provider: "test",
		model: "model",
		usage: totals(totalTokens),
	};
}

function ledger(): UsageLedger {
	return new UsageLedger(
		join(mkdtempSync(join(tmpdir(), "pi-usage-bar-")), "usage.sqlite"),
	);
}

test("reattribution combines target totals and surgical undo preserves target rows", () => {
	const db = ledger();
	try {
		db.insertEvent(event("1", "source", 100));
		db.insertEvent(event("2", "source", 50));
		db.insertEvent(event("3", "target", 25));

		const result = db.reattributeProject("source", "target", true);
		assert.equal(result.changedRows, 2);
		assert.equal(result.toBefore.totalTokens, 25);
		assert.equal(result.toAfter.totalTokens, 175);
		assert.equal(db.totalsForProject("source").totalTokens, 0);
		assert.equal(db.totalsForProject("target").totalTokens, 175);

		db.insertEvent(event("4", "target", 10));
		const undo = db.undoAttribution(result.operationId);
		assert.ok(undo);
		assert.equal(undo.changedRows, 2);
		assert.equal(db.totalsForProject("source").totalTokens, 150);
		assert.equal(db.totalsForProject("target").totalTokens, 35);
	} finally {
		db.close();
	}
});

test("schema migrates to latest version", () => {
	const db = ledger();
	try {
		assert.equal(db.schemaVersion(), 5);
	} finally {
		db.close();
	}
});

test("insert waits for a concurrent writer to release the ledger", async () => {
	const path = join(
		mkdtempSync(join(tmpdir(), "pi-usage-bar-lock-")),
		"usage.sqlite",
	);
	const db = new UsageLedger(path);
	const blocker = spawn(
		process.execPath,
		[
			"--input-type=module",
			"--eval",
			`import { DatabaseSync } from "node:sqlite";
			const db = new DatabaseSync(process.argv[1]);
			db.exec("BEGIN IMMEDIATE");
			process.stdout.write("locked\\n");
			Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
			db.exec("COMMIT");
			db.close();`,
			path,
		],
		{ stdio: ["ignore", "pipe", "inherit"] },
	);

	try {
		await once(blocker.stdout, "data");
		assert.equal(db.insertEvent(event("locked-write", "project", 1)), true);
		assert.equal(db.rowCount(), 1);
	} finally {
		if (blocker.exitCode === null) blocker.kill();
		db.close();
	}
});
