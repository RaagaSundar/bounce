import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { d1SchemaStatements } from "../db/schema.ts";

// The schema is declared twice: `d1SchemaStatements` bootstraps a database at
// runtime so local dev works without a migration step, while drizzle/*.sql is
// the production source of truth. Nothing forces them to agree, so this checks
// that they do.

// Every migration, in order - not just the first, or adding a table would
// silently drift the two definitions apart.
const migrationDir = new URL("../drizzle/", import.meta.url);
const migrationFiles = (await readdir(migrationDir))
  .filter((name) => name.endsWith(".sql"))
  .sort();

const migrationSql = (
  await Promise.all(
    migrationFiles.map((name) => readFile(new URL(name, migrationDir), "utf8")),
  )
).join("\n--> statement-breakpoint\n");

/**
 * Strips backticks, collapses whitespace, and drops the trailing semicolon so
 * the migration's statements and the runtime's compare equal.
 */
const normalize = (sql) =>
  sql
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/;$/, "")
    .trim();

function splitTopLevel(body) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (const char of body) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  if (current.trim()) parts.push(current);
  return parts.map((part) => part.trim());
}

/**
 * Replays statements in order, so a later DROP undoes an earlier CREATE. Both
 * inputs are ordered sequences of migrations, and ignoring drops would compare
 * a schema that never existed.
 */
function parse(statements) {
  const tables = new Map();
  const indexes = new Map();

  for (const raw of statements) {
    const sql = normalize(raw);

    const table = sql.match(/^CREATE TABLE (?:IF NOT EXISTS )?(\w+) \(([\s\S]*)\)$/i);
    if (table) {
      const columns = splitTopLevel(table[2]).map((line) => line.split(/\s+/)[0]);
      tables.set(table[1], columns.sort());
      continue;
    }

    const dropTable = sql.match(/^DROP TABLE (?:IF EXISTS )?(\w+)$/i);
    if (dropTable) {
      tables.delete(dropTable[1]);
      // SQLite drops a table's indexes with it.
      for (const [name, index] of indexes) {
        if (index.table === dropTable[1]) indexes.delete(name);
      }
      continue;
    }

    const dropIndex = sql.match(/^DROP INDEX (?:IF EXISTS )?(\w+)$/i);
    if (dropIndex) {
      indexes.delete(dropIndex[1]);
      continue;
    }

    const index = sql.match(
      /^CREATE (UNIQUE )?INDEX (?:IF NOT EXISTS )?(\w+) ON (\w+) \(([^)]*)\)$/i,
    );
    if (index) {
      indexes.set(index[2], {
        unique: Boolean(index[1]),
        table: index[3],
        columns: index[4].split(",").map((column) => column.trim()),
      });
    }
  }

  return { tables, indexes };
}

const runtime = parse(d1SchemaStatements);
const migration = parse(migrationSql.split("--> statement-breakpoint"));

test("both schema definitions were parsed", () => {
  // Exact counts, not `> 0`: a regex that silently stops matching would make
  // every comparison below pass vacuously.
  assert.ok(migrationFiles.length >= 1, "no migrations found to compare against");
  // D1 is the archive now: one table survives migration replay.
  assert.equal(runtime.tables.size, 1, "expected 1 table from runtime statements");
  assert.equal(migration.tables.size, 1, "expected 1 table after replaying migrations");
  assert.equal(runtime.indexes.size, 2, "expected 2 indexes from runtime statements");
  assert.equal(migration.indexes.size, 2, "expected 2 indexes after replaying migrations");
});

test("runtime bootstrap and migration declare the same tables", () => {
  assert.deepEqual(
    [...runtime.tables.keys()].sort(),
    [...migration.tables.keys()].sort(),
  );
});

test("each table has the same columns in both definitions", () => {
  for (const [table, columns] of runtime.tables) {
    assert.deepEqual(columns, migration.tables.get(table), `columns differ for ${table}`);
  }
});

test("runtime bootstrap and migration declare the same indexes", () => {
  assert.deepEqual(
    [...runtime.indexes.keys()].sort(),
    [...migration.indexes.keys()].sort(),
  );
  for (const [name, index] of runtime.indexes) {
    assert.deepEqual(index, migration.indexes.get(name), `index ${name} differs`);
  }
});

test("the archive is queryable by room and by game", () => {
  // Both are how a recap screen and any cross-event question reach this table;
  // without them those become full scans.
  assert.deepEqual(migration.indexes.get("game_sessions_room_idx")?.columns, ["room_code", "ended_at"]);
  assert.deepEqual(migration.indexes.get("game_sessions_game_idx")?.columns, ["game_id", "ended_at"]);
});

test("dropped quiz tables stay dropped", () => {
  // The old engine's tables were removed with it. If one reappears in either
  // definition, something resurrected the quiz schema by accident.
  for (const dead of ["game_rooms", "game_players", "game_actions"]) {
    assert.equal(runtime.tables.has(dead), false, `${dead} is back in the runtime schema`);
    assert.equal(migration.tables.has(dead), false, `${dead} is back after migration replay`);
  }
});
