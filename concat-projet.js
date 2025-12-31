#!/usr/bin/env node
/* concat-projet.js
 * Usage:
 *   node concat-projet.js out.txt .
 *   node concat-projet.js out.txt C:\path\to\project
 */

const fs = require("fs");
const path = require("path");

const outName = process.argv[2] || "project_dump.txt";
const baseDir = process.argv[3] || ".";

const MAX_FILE_SIZE_BYTES = 800_000;

const IGNORE_DIRS = new Set([
  "node_modules",
  ".angular",
  "dist",
  ".git",
  ".firebase",
  "coverage",
  ".vscode",
]);

const IGNORE_FILES = new Set([
  "package-lock.json", // trop gros
  "yarn.lock",
  "pnpm-lock.yaml",
  outName,
]);

const IMPORTANT_EXACT_FILES = new Set([
  "package.json",
  "firebase.json",
  "angular.json",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.spec.json",
  "src/main.ts",
  "src/index.html",
  "src/styles.scss",
]);

const ALLOWED_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".html",
  ".scss",
  ".css",
  ".md",
  ".txt",
  ".yml",
  ".yaml",
]);

function normalizeSlashes(p) {
  return p.split(path.sep).join("/");
}

function shouldIncludeFile(filePath, rel) {
  const name = path.basename(filePath);
  if (IGNORE_FILES.has(name)) return false;

  // whitelist exact importants, même sans extension “classique”
  const relNorm = normalizeSlashes(rel);
  if (IMPORTANT_EXACT_FILES.has(relNorm) || IMPORTANT_EXACT_FILES.has(name)) return true;

  const ext = path.extname(name).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) return false;

  return true;
}

function walk(dirAbs, outFiles, baseAbs) {
  const entries = fs.readdirSync(dirAbs, { withFileTypes: true });
  for (const e of entries) {
    const abs = path.join(dirAbs, e.name);
    const rel = path.relative(baseAbs, abs);

    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(abs, outFiles, baseAbs);
      continue;
    }

    if (!e.isFile()) continue;
    if (!shouldIncludeFile(abs, rel)) continue;

    outFiles.push(abs);
  }
}

function safeRead(filePath) {
  const stat = fs.statSync(filePath);
  if (stat.size > MAX_FILE_SIZE_BYTES) {
    return `/* SKIPPED: file too large (${stat.size} bytes) */\n`;
  }

  const buf = fs.readFileSync(filePath);

  // Heuristique binaire
  for (let i = 0; i < buf.length; i += Math.max(1, Math.floor(buf.length / 50))) {
    if (buf[i] === 0) return `/* SKIPPED: looks binary */\n`;
  }

  return buf.toString("utf8");
}

/**
 * Construit une arborescence (tree) à partir d’une liste de chemins relatifs.
 * Exemple de rendu:
 *   src/
 *     app/
 *       app.component.ts
 *     main.ts
 */
function buildTreeFromRelPaths(relPaths) {
  const root = { children: new Map(), isFile: false };

  for (const rel of relPaths) {
    const parts = rel.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;

      if (!node.children.has(part)) {
        node.children.set(part, { children: new Map(), isFile: false });
      }
      node = node.children.get(part);
      if (isLast) node.isFile = true;
    }
  }

  function sortKeys(map) {
    return Array.from(map.keys()).sort((a, b) => a.localeCompare(b));
  }

  function render(node, prefix = "") {
    const lines = [];
    const keys = sortKeys(node.children);

    // Dossiers avant fichiers (simple heuristique: "a/" si a a des enfants)
    keys.sort((a, b) => {
      const na = node.children.get(a);
      const nb = node.children.get(b);
      const da = na.children.size > 0;
      const db = nb.children.size > 0;
      if (da !== db) return da ? -1 : 1;
      return a.localeCompare(b);
    });

    for (const key of keys) {
      const child = node.children.get(key);
      const isDir = child.children.size > 0;
      lines.push(`${prefix}${key}${isDir ? "/" : ""}`);
      if (isDir) lines.push(...render(child, prefix + "  "));
    }
    return lines;
  }

  return render(root).join("\n") + "\n";
}

function main() {
  const absBase = path.resolve(baseDir);
  const absOut = path.resolve(outName);

  const files = [];
  walk(absBase, files, absBase);

  // rootFirst = certains fichiers importants en tête
  const rootFirst = [];
  const rest = [];

  for (const f of files) {
    const rel = path.relative(absBase, f);
    const relNorm = normalizeSlashes(rel);
    const name = path.basename(f);
    const isRoot = !rel.includes(path.sep);

    if (isRoot && IMPORTANT_EXACT_FILES.has(name)) rootFirst.push(f);
    else if (IMPORTANT_EXACT_FILES.has(relNorm)) rootFirst.push(f);
    else rest.push(f);
  }

  rootFirst.sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)));
  rest.sort((a, b) => normalizeSlashes(a).localeCompare(normalizeSlashes(b)));

  const ordered = [...rootFirst, ...rest];

  const relPaths = ordered.map(f => normalizeSlashes(path.relative(absBase, f)));

  const parts = [];
  parts.push(
    `# Project concat\n` +
    `# Base: ${absBase}\n` +
    `# Output: ${absOut}\n` +
    `# Generated: ${new Date().toISOString()}\n` +
    `# Files: ${ordered.length}\n\n`
  );

  // ✅ Arborescence au début
  parts.push(`## TREE (included files)\n`);
  parts.push(buildTreeFromRelPaths(relPaths));
  parts.push(`\n`);

  for (const filePath of ordered) {
    const rel = normalizeSlashes(path.relative(absBase, filePath));
    const abs = path.resolve(filePath);

    // ✅ Ajoute chemin absolu dans le header
    parts.push(`\n\n===== FILE: ${rel} =====\n`);
    parts.push(`// ABSOLUTE: ${abs}\n\n`);
    parts.push(safeRead(filePath));
    if (!parts[parts.length - 1].endsWith("\n")) parts.push("\n");
  }

  fs.writeFileSync(absOut, parts.join(""), "utf8");
  console.log(`OK -> ${absOut} (${ordered.length} files)`);
}

main();
