const baseUrl = (process.env.SMOKE_BASE_URL || "").replace(/\/+$/, "");

if (!baseUrl) {
  console.error("Missing SMOKE_BASE_URL");
  process.exit(1);
}

const checks = [
  { name: "health", path: "/api/health", expected: [200, 503] },
  { name: "dashboard", path: "/dashboard", expected: [200, 302, 307, 308] },
];

let failed = false;

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  try {
    const response = await fetch(url, { redirect: "manual" });
    const ok = check.expected.includes(response.status);
    console.log(`${check.name}: ${response.status} (${url})`);
    if (!ok) failed = true;
  } catch (error) {
    failed = true;
    console.error(
      `${check.name}: request_failed (${url})`,
      error instanceof Error ? error.message : "unknown_error",
    );
  }
}

process.exit(failed ? 1 : 0);
