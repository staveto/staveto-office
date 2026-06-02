import fs from "fs";
import path from "path";

const src = fs.readFileSync(path.join("src", "i18n", "translations.ts"), "utf8");

function extract(locale) {
  let re;
  if (locale === "en") {
    re = /en:\s*\{([\s\S]*?)\n  sk:\s*\{/;
  } else if (locale === "sk") {
    re = /sk:\s*\{([\s\S]*?)\n\};/;
  } else {
    throw new Error(`Unknown locale ${locale}`);
  }
  const match = src.match(re);
  if (!match) throw new Error(`Locale ${locale} not found`);
  const body = match[1];
  const entries = {};
  const lineRe = /"((?:[^"\\]|\\.)+)":\s*"((?:[^"\\]|\\.)*)"/g;
  let m;
  while ((m = lineRe.exec(body))) {
    entries[m[1]] = m[2]
      .replace(/\\"/g, '"')
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\");
  }
  return entries;
}

const en = extract("en");
const sk = extract("sk");
console.log("en keys:", Object.keys(en).length);
console.log("sk keys:", Object.keys(sk).length);
const missingInSk = Object.keys(en).filter((k) => !sk[k]);
const missingInEn = Object.keys(sk).filter((k) => !en[k]);
if (missingInSk.length) console.log("missing in sk:", missingInSk.length, missingInSk.slice(0, 5));
if (missingInEn.length) console.log("missing in en:", missingInEn.length);

fs.writeFileSync(
  path.join("src", "i18n", "_en-keys.json"),
  JSON.stringify(en, null, 2),
  "utf8"
);
fs.writeFileSync(
  path.join("src", "i18n", "_sk-keys.json"),
  JSON.stringify(sk, null, 2),
  "utf8"
);
