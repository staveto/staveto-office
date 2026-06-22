/**
 * Deploy firestore.rules via the Firebase Rules REST API using an access token.
 * Usage: node scripts/deploy-rules-rest.mjs <accessToken>
 * (token from: gcloud auth application-default print-access-token)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT = "staveto-mvp-5f251";
const token = process.argv[2];
if (!token) {
  console.error("Missing access token arg");
  process.exit(1);
}

const rulesPath = join(__dirname, "..", "firestore.rules");
const content = readFileSync(rulesPath, "utf8");

const headers = {
  Authorization: `Bearer ${token}`,
  "Content-Type": "application/json",
};

async function main() {
  // 1) Create ruleset (compiles + validates server-side)
  const createRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/rulesets`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        source: { files: [{ name: "firestore.rules", content }] },
      }),
    }
  );
  const createJson = await createRes.json();
  if (!createRes.ok) {
    console.error("CREATE FAILED:", JSON.stringify(createJson, null, 2));
    process.exit(1);
  }
  const rulesetName = createJson.name;
  console.log("CREATED_RULESET:", rulesetName);

  // 2) Point the cloud.firestore release at the new ruleset
  const relRes = await fetch(
    `https://firebaserules.googleapis.com/v1/projects/${PROJECT}/releases/cloud.firestore`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        release: {
          name: `projects/${PROJECT}/releases/cloud.firestore`,
          rulesetName,
        },
      }),
    }
  );
  const relJson = await relRes.json();
  if (!relRes.ok) {
    console.error("RELEASE FAILED:", JSON.stringify(relJson, null, 2));
    process.exit(1);
  }
  console.log("RELEASE_UPDATED:", relJson.name, "->", relJson.rulesetName);
  console.log("DONE");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
