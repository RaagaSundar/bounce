import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { d1SchemaStatements } from "../db/schema.ts";

// The schema is declared twice: `d1SchemaStatements` bootstraps a database at
// runtime so local dev works without a migration step, while drizzle/*.sql is
// the production source of truth. Nothing forces them to agree, so this checks
// that they do.

const migrationSql = await readFile(
  new URL("../drizzle/0000_tiresome_vulcan.sql", import.meta.url),
  "utf8",
);

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
  assert.equal(runtime.tables.size, 3, "expected 3 tables from runtime statements");
  assert.equal(migration.tables.size, 3, "expected 3 tables from the migration");
  assert.equal(runtime.indexes.size, 5, "expected 5 indexes from runtime statements");
  assert.equal(migration.indexes.size, 5, "expected 5 indexes from the migration");
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

test("player identity and room codes stay unique", () => {
  // Room codes are handed out verbally off a projector, and a player token is
  // the only credential a phone holds. Both must stay collision-free.
  assert.equal(migration.indexes.get("game_rooms_code_unique")?.unique, true);
  assert.equal(migration.indexes.get("game_players_token_unique")?.unique, true);
});

test("one action per player per round is still enforced", () => {
  // This constraint is what limits the game to multiple choice: it cannot model
  // a drawing stroke, a vote plus a guess, or a stream of tap timestamps. The
  // minigame rebuild has to replace it with an instance-scoped input log, and
  // this assertion should be updated in the same change - deliberately, not by
  // accident.
  const constraint = migration.indexes.get("game_actions_player_round_unique");
  assert.equal(constraint?.unique, true);
  assert.deepEqual(constraint?.columns, ["player_id", "round"]);
});
