import "dotenv/config";

import assert from "node:assert/strict";
import type { Server } from "node:http";

import { app as adminApp } from "../apps/admin-api/app.js";
import { app as mainApp } from "../apps/main-api/app.js";
import { pool } from "../config/db.js";
import { withTenantTransaction } from "../shared/db/tenant-transaction.js";

interface Success<T> { success: true; data: T }

function listen(app: typeof mainApp): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = app.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Unable to bind test server");
      resolve({ server, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function close(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function run() {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Bootstrap admin email and password are required");

  const main = await listen(mainApp);
  const admin = await listen(adminApp);
  let createdUserId: string | undefined;
  let tenantId: string | undefined;
  let actorId: string | undefined;

  try {
    const loginResponse = await fetch(`${main.url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password })
    });
    assert.equal(loginResponse.status, 200);
    const sessionCookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    assert.ok(sessionCookie);
    const login = await loginResponse.json() as Success<{
      user: { id: string; tenantId: string }
    }>;
    tenantId = login.data.user.tenantId;
    actorId = login.data.user.id;
    const trustedOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",")[0]?.trim();
    assert.ok(trustedOrigin);
    const headers = { cookie: sessionCookie, "content-type": "application/json", origin: trustedOrigin };

    const me = await fetch(`${main.url}/api/auth/me`, { headers });
    assert.equal(me.status, 200);
    assert.equal((await fetch(`${main.url}/api/clinics`, { headers })).status, 200);
    assert.equal((await fetch(`${main.url}/api/rooms`, { headers })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/clinics`, { headers })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/rooms`, { headers })).status, 200);
    const rolesResponse = await fetch(`${admin.url}/admin/roles`, { headers });
    assert.equal(rolesResponse.status, 200);
    const roles = await rolesResponse.json() as Success<{ id: string; name: string }[]>;
    const direccionRole = roles.data.find((role) => role.name === "direccion");
    assert.ok(direccionRole);

    const activeAdminCount = await withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
      const result = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count
         FROM users u
         JOIN user_roles ur ON ur.tenant_id = u.tenant_id AND ur.user_id = u.id
         JOIN roles r ON r.tenant_id = ur.tenant_id AND r.id = ur.role_id
         WHERE u.tenant_id = $1
           AND u.status = 'active'
           AND u.deleted_at IS NULL
           AND r.name = 'admin'
           AND r.deleted_at IS NULL`,
        [tenantId]
      );
      return Number(result.rows[0]?.count ?? 0);
    }, pool);

    if (activeAdminCount === 1) {
      const lastAdminDeactivation = await fetch(`${admin.url}/admin/users/${actorId}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ status: "inactive" })
      });
      assert.equal(lastAdminDeactivation.status, 409);

      const lastAdminRoleRemoval = await fetch(`${admin.url}/admin/users/${actorId}/roles`, {
        method: "PUT",
        headers,
        body: JSON.stringify({ roleIds: [direccionRole.id] })
      });
      assert.equal(lastAdminRoleRemoval.status, 409);
    }

    const uniqueEmail = `m1-test-${Date.now()}@crit.test`;
    const createdResponse = await fetch(`${admin.url}/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        fullName: "M1 Integration User",
        email: uniqueEmail,
        password: "Integration-Password-123",
        roleIds: [direccionRole.id],
        clinicAccess: []
      })
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json() as Success<{ id: string; email: string }>;
    createdUserId = created.data.id;
    assert.equal(created.data.email, uniqueEmail);
    assert.equal("password" in created.data, false);
    assert.equal("passwordHash" in created.data, false);

    assert.equal((await fetch(`${admin.url}/admin/users/${createdUserId}`, { headers })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/users?page=1&pageSize=20`, { headers })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/users/${createdUserId}/roles`, {
      method: "PUT", headers, body: JSON.stringify({ roleIds: [direccionRole.id] })
    })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/users/${createdUserId}/clinic-access`, {
      method: "PUT", headers, body: JSON.stringify({ clinicAccess: [] })
    })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/users/${createdUserId}`, {
      method: "PATCH", headers, body: JSON.stringify({ status: "inactive" })
    })).status, 200);
    assert.equal((await fetch(`${admin.url}/admin/users/${createdUserId}/password`, {
      method: "PUT", headers, body: JSON.stringify({ password: "Replacement-Password-123" })
    })).status, 204);
    assert.equal((await fetch(`${admin.url}/admin/users?tenantId=${tenantId}`, { headers })).status, 400);
    console.log("M1 integration checks passed");
  } finally {
    if (createdUserId && tenantId && actorId) {
      await withTenantTransaction({ tenantId, userId: actorId }, async (client) => {
        await client.query("DELETE FROM collaborators WHERE tenant_id = $1 AND user_id = $2", [tenantId, createdUserId]);
        await client.query("DELETE FROM users WHERE tenant_id = $1 AND id = $2", [tenantId, createdUserId]);
      }, pool);
    }
    await close(main.server);
    await close(admin.server);
    await pool.end();
  }
}

run().catch((error: unknown) => {
  console.error("M1 integration checks failed", {
    name: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : "Unknown error"
  });
  process.exitCode = 1;
});
