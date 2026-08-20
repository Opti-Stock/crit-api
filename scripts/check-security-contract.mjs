import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const root = new URL("../", import.meta.url);
const errors = [];

for (const name of await readdir(new URL("src/modules/", root))) {
  const controller = new URL(`src/modules/${name}/${name}.controller.ts`, root);
  try {
    const source = await readFile(controller, "utf8");
    if (/\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\b(FROM|INTO|SET)\b/i.test(source)) {
      errors.push(`${name}: raw SQL is not allowed in controllers`);
    }
  } catch {
    // Not every module has a conventionally named controller.
  }

  const repository = new URL(`src/modules/${name}/${name}.repository.ts`, root);
  try {
    const source = await readFile(repository, "utf8");
    if (/INSERT\s+INTO\s+(?:public\.)?audit_logs\b/i.test(source)) {
      errors.push(`${name}: application repositories cannot insert directly into audit_logs`);
    }
  } catch {
    // Not every module has a conventionally named repository.
  }
}

const ignoredFiles = new Set([".env.local.example", ".env.render.example", ".env.production.example", ".env.example"]);
for (const file of await readdir(root)) {
  if (file.startsWith(".env") && !ignoredFiles.has(file) && file !== ".env") {
    errors.push(`${file}: unexpected environment file`);
  }
}

const aiAssistanceRoutes = await readFile(new URL("src/modules/ai-assistance/ai-assistance.routes.ts", root), "utf8");
if (/aiAssistanceRouter\.use\([\s\S]*requireRoles/.test(aiAssistanceRoutes)) {
  errors.push("ai-assistance: route-level roles must not gate unrelated /api routes");
}

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("API source security contract passed");
