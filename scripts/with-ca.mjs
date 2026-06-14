// Launches `next <args>` with NODE_EXTRA_CA_CERTS pointed at a local CA bundle
// IF that bundle exists. This makes server-side HTTPS (Google Maps Directions,
// Google Fonts, etc.) work behind a TLS-intercepting corporate VPN where Node
// otherwise fails with UNABLE_TO_VERIFY_LEAF_SIGNATURE.
//
// On machines/CI without the bundle (no interception) it is a no-op, so the
// scripts stay portable.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const caPath = path.join(here, "..", "certs", "win-ca-bundle.pem");

const env = { ...process.env };
if (!env.NODE_EXTRA_CA_CERTS && existsSync(caPath)) {
  env.NODE_EXTRA_CA_CERTS = caPath;
}

const args = process.argv.slice(2);
const child = spawn(`next ${args.join(" ")}`, {
  stdio: "inherit",
  env,
  shell: true,
});
child.on("exit", (code) => process.exit(code ?? 0));
