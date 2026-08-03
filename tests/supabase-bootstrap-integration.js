const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const accessToken = String(process.env.SUPABASE_ACCESS_TOKEN || "").trim();
const projectRef = String(process.env.SUPABASE_PROJECT_REF || "").trim();

if (!accessToken || !projectRef) {
  console.error("FAIL: set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF in the environment.");
  process.exit(1);
}

if (!/^[a-z0-9-]+$/i.test(projectRef)) {
  console.error("FAIL: SUPABASE_PROJECT_REF has an invalid format.");
  process.exit(1);
}

const migrationPaths = [
  "20260802_bootstrap_dashboard_year.sql",
  "20260803_fix_bootstrap_real_estimation.sql"
];
const migrations = migrationPaths
  .map((filename) => fs.readFileSync(path.join(root, "database", "migrations", filename), "utf8"))
  .join("\n\n");
const integrationTemplate = fs.readFileSync(
  path.join(__dirname, "bootstrap-year-integration.sql"),
  "utf8"
);
const placeholder = "/*__BOOTSTRAP_MIGRATION__*/";

if (!integrationTemplate.includes(placeholder)) {
  console.error("FAIL: integration SQL migration placeholder is missing.");
  process.exit(1);
}

const query = integrationTemplate.replace(placeholder, migrations);
const endpoint = `https://api.supabase.com/v1/projects/${encodeURIComponent(projectRef)}/database/query`;

async function run() {
  // A single request keeps BEGIN through ROLLBACK on one database connection.
  // Uncaught SQL errors abort that transaction; no request-body files are created.
  let response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(150000)
    });
  } catch {
    console.error("FAIL: Supabase Management API dry-run request could not complete.");
    process.exitCode = 1;
    return;
  }

  const responseText = await response.text();
  if (!response.ok) {
    const safeMarker = responseText.match(/BOOTSTRAP_INTEGRATION_[A-Z0-9_:-]+/)?.[0];
    console.error(
      safeMarker
        ? `FAIL: ${safeMarker}`
        : `FAIL: Supabase Management API returned HTTP ${response.status}.`
    );
    process.exitCode = 1;
    return;
  }

  if (!responseText.includes("BOOTSTRAP_INTEGRATION_PASS")) {
    console.error("FAIL: dry-run response did not contain the rollback completion marker.");
    process.exitCode = 1;
    return;
  }

  console.log("PASS: all dashboard bootstrap PostgreSQL checks completed and rolled back.");
}

run();
