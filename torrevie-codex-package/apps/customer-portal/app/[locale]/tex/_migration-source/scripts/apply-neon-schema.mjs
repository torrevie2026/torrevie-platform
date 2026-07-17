import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { neon } from '@neondatabase/serverless';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('DATABASE_URL is required to apply the Neon schema.');
  process.exit(1);
}

function splitSqlStatements(sqlText) {
  const statements = [];
  let current = '';
  let quote = null;
  let dollarTag = null;
  let lineComment = false;
  let blockComment = false;

  for (let index = 0; index < sqlText.length; index += 1) {
    const char = sqlText[index];
    const next = sqlText[index + 1];

    if (lineComment) {
      current += char;
      if (char === '\n') lineComment = false;
      continue;
    }

    if (blockComment) {
      current += char;
      if (char === '*' && next === '/') {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }

    if (dollarTag) {
      current += char;
      if (char === '$' && sqlText.slice(index - dollarTag.length + 1, index + 1) === dollarTag) {
        dollarTag = null;
      }
      continue;
    }

    if (quote) {
      current += char;
      if (char === quote && sqlText[index - 1] !== '\\') quote = null;
      continue;
    }

    if (char === '-' && next === '-') {
      current += char + next;
      index += 1;
      lineComment = true;
      continue;
    }

    if (char === '/' && next === '*') {
      current += char + next;
      index += 1;
      blockComment = true;
      continue;
    }

    if (char === '\'' || char === '"') {
      quote = char;
      current += char;
      continue;
    }

    if (char === '$') {
      const match = sqlText.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (match) dollarTag = match[0];
      current += char;
      continue;
    }

    if (char === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) statements.push(trailing);
  return statements;
}

const schemaPath = resolve('db/schema.sql');
const schemaSql = await readFile(schemaPath, 'utf8');
const statements = splitSqlStatements(schemaSql);
const sql = neon(connectionString);

console.log(`Applying ${statements.length} schema statements from ${schemaPath}`);

for (const [index, statement] of statements.entries()) {
  await sql.query(statement);
  console.log(`Applied ${index + 1}/${statements.length}`);
}

console.log('Neon schema applied successfully.');
