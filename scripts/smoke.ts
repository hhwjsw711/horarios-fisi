const baseUrl = (process.env.SMOKE_BASE_URL ?? process.argv[2] ?? "").replace(
  /\/$/,
  "",
);

if (!baseUrl) {
  throw new Error("Set SMOKE_BASE_URL or pass the deployment URL.");
}

const checks = [
  {
    path: "/api/health",
    expectedStatus: 200,
    expectedOkBody: true,
  },
  {
    path: "/",
    expectedStatus: 307,
    expectedLocation: "/es",
  },
  {
    path: "/es/sign-in",
    expectedStatus: 200,
  },
  {
    path: "/api/schedule",
    expectedStatus: 401,
  },
  {
    path: "/es/direction",
    expectedStatus: 307,
    expectedLocation: "/es/sign-in",
  },
  {
    path: "/es/direction/users",
    expectedStatus: 307,
    expectedLocation: "/es/sign-in",
  },
  {
    path: "/es/direction/audit",
    expectedStatus: 307,
    expectedLocation: "/es/sign-in",
  },
  {
    path: "/es/direction/settings",
    expectedStatus: 307,
    expectedLocation: "/es/sign-in",
  },
];

const results = [];

for (const check of checks) {
  const response = await fetch(`${baseUrl}${check.path}`, {
    redirect: "manual",
    signal: AbortSignal.timeout(10_000),
  });
  const location = response.headers.get("location");
  const body = check.expectedOkBody
    ? await response.json().catch(() => null)
    : null;
  const ok =
    response.status === check.expectedStatus &&
    (!check.expectedLocation ||
      locationPath(location) === check.expectedLocation) &&
    (!check.expectedOkBody || body?.ok === true);
  results.push({
    path: check.path,
    status: response.status,
    location,
    bodyOk: check.expectedOkBody ? body?.ok === true : undefined,
    ok,
  });
}

const failed = results.filter((result) => !result.ok);
console.log(JSON.stringify({ ok: failed.length === 0, results }, null, 2));

if (failed.length) {
  throw new Error("Smoke checks failed.");
}

function locationPath(location: string | null) {
  if (!location) {
    return null;
  }
  try {
    return new URL(location).pathname;
  } catch {
    return location;
  }
}

export {};
