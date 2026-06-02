import fs from "fs";
import path from "path";
import { buildDeCatalog } from "./de-translate.mjs";

const en = JSON.parse(
  fs.readFileSync(path.join("src", "i18n", "_en-keys.json"), "utf8")
);
const sk = JSON.parse(
  fs.readFileSync(path.join("src", "i18n", "_sk-keys.json"), "utf8")
);

const de = buildDeCatalog(en, sk);

fs.writeFileSync(
  path.join("src", "i18n", "de.json"),
  JSON.stringify(de, null, 2) + "\n",
  "utf8"
);

const missing = Object.keys(en).filter((k) => de[k] === en[k]);
console.log("de.json keys:", Object.keys(de).length);
console.log("unchanged from en (fallback quality):", missing.length);
