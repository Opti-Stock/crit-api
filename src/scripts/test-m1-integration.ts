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
  const tenantCode = process.env.BOOTSTRAP_ADMIN_TENANT_CODE;
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!tenantCode || !email || !password) throw new Error("Bootstrap environment variables are required");

  const main = await listen(mainApp);
  const admin = await listen(adminApp);
  let createdUserId: string | undefined;
  let tenantId: string | undefined;
  let actorId: string | undefined;

  try {
    const loginResponse = await fetch(`${main.url}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenantCode, email, password })
    });
    assert.equal(loginResponse.status, 200);
    const login = await loginResponse.json() as Success<{
      accessToken: string;
      user: { id: string; tenantId: string }
    }>;
    const token = login.data.accessToken;
    tenantId = login.data.user.tenantId;
    actorId = login.data.user.id;
    const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const me = await fetch(`${main.url}/api/auth/me`, { headers });
    assert.equal(me.status, 200);
    const rolesResponse = await fetch(`${admin.url}/admin/roles`, { headers });
    assert.equal(rolesResponse.status, 200);
    const roles = await rolesResponse.json() as Success<{ id: string; name: string }[]>;
    const direccionRole = roles.data.find((role) => role.name === "direccion");
    assert.ok(direccionRole);

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
