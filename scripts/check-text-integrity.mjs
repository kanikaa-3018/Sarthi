import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["frontend/src", "apps/api/src"];
const REQUIRED_DEVANAGARI_FILES = [
  { file: "frontend/src/i18n.ts", min: 1000 },
  { file: "frontend/src/app/App.tsx", min: 20 }
];

const SUSPICIOUS_CODE_POINTS = new Set([
  0x00c0, // À
  0x00c2, // Â
  0x00c3, // Ã
  0x00e0, // à
  0x00e2, // â
  0x00e3, // ã
  0xfffd // replacement character
]);

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css", ".json", ".md"]);

const failures = [];

for (const root of ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf8");
    const markers = suspiciousMarkers(text);
    if (markers.length) {
      failures.push(`${relative(process.cwd(), file)} contains possible mojibake markers: ${markers.join(", ")}`);
    }
  }
}

for (const { file, min } of REQUIRED_DEVANAGARI_FILES) {
  const text = readFileSync(file, "utf8");
  const count = countDevanagari(text);
  if (count < min) {
    failures.push(`${file} contains ${count} Devanagari characters; expected at least ${min}.`);
  }
}

if (failures.length) {
  console.error("Text integrity check failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("Text integrity check passed.");

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      yield* walk(path);
      continue;
    }
    if (SOURCE_EXTENSIONS.has(extension(path))) yield path;
  }
}

function extension(path) {
  const dot = path.lastIndexOf(".");
  return dot >= 0 ? path.slice(dot) : "";
}

function suspiciousMarkers(text) {
  const found = new Set();
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (SUSPICIOUS_CODE_POINTS.has(cp) || (cp >= 0x0080 && cp <= 0x009f)) {
      found.add(`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`);
    }
  }
  return [...found].sort();
}

function countDevanagari(text) {
  let count = 0;
  for (const char of text) {
    const cp = char.codePointAt(0);
    if (cp >= 0x0900 && cp <= 0x097f) count += 1;
  }
  return count;
}
