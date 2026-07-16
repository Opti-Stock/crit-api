const moduleUrl = new URL("../dist/openapi/operations.js", import.meta.url);
const groups = await import(moduleUrl);

for (const [name, operations] of Object.entries(groups)) {
  const seen = new Set();
  for (const operation of operations) {
    const key = `${operation.method} ${operation.path}`;
    if (!operation.path.startsWith("/") || seen.has(key)) {
      throw new Error(`${name}: invalid or duplicate OpenAPI operation ${key}`);
    }
    seen.add(key);
  }
}

process.env.OPENAPI_ENABLED = "true";
const [{ app }, { env }, jwtModule, { pool }] = await Promise.all([
  import(new URL("../dist/apps/main-api/app.js", import.meta.url)),
  import(new URL("../dist/config/env.js", import.meta.url)),
  import("jsonwebtoken"),
  import(new URL("../dist/config/db.js", import.meta.url)),
]);

const token = jwtModule.default.sign(
  { tenantId: "00000000-0000-0000-0000-000000000001", roles: ["admin"] },
  env.JWT_SECRET,
  {
    algorithm: "HS256",
    subject: "20000000-0000-0000-0000-000000000001",
    expiresIn: "5m",
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
  },
);

const server = await new Promise((resolve) => {
  const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
});

try {
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("OpenAPI validation server did not start");
  const headers = { Cookie: `crit_session=${token}` };
  const specResponse = await fetch(`http://127.0.0.1:${address.port}/api/openapi.json`, { headers });
  const document = await specResponse.json();
  if (!specResponse.ok || document.openapi !== "3.1.0" || !document.components?.schemas?.Error) {
    throw new Error("Generated OpenAPI document is invalid or inaccessible");
  }

  const uiResponse = await fetch(`http://127.0.0.1:${address.port}/api/docs/`, { headers });
  if (!uiResponse.ok || !(await uiResponse.text()).includes('id="swagger-ui"')) {
    throw new Error("Protected Swagger UI is unavailable");
  }
} finally {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await pool.end();
}

console.log("OpenAPI 3.1 and protected Swagger UI contracts passed");
