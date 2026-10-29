import { build } from "esbuild";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// Bundle only our code, replacing the database module before it can open a
// connection. No credentials, live database, emails, or AI calls are needed.
// Keep the bundle under node_modules so ESM resolves external dependencies.
await mkdir(resolve("node_modules/.cache"), { recursive: true });
const temp = await mkdtemp(resolve("node_modules/.cache/sales-regression-"));
try {
  const outfile = join(temp, "sales.test.mjs");
  await build({
    entryPoints: [process.argv[2] ?? "tests/sales.test.tsx"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    jsx: "automatic",
    plugins: [{
      name: "isolated-sales-database",
      setup(build) {
        build.onResolve({ filter: /^\.\/db$/ }, args => {
          if (args.resolveDir === resolve("server")) {
            return { path: resolve("tests/support/sales-database.ts") };
          }
        });
      },
    }],
  });
  const result = spawnSync(process.execPath, ["--test", outfile], {
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "test",
      // Dummy values only: route registration constructs a client but the
      // tested endpoints never use it.
      AI_INTEGRATIONS_OPENAI_API_KEY: "unused-test-key",
      AI_INTEGRATIONS_OPENAI_BASE_URL: "http://127.0.0.1:1",
      MAILGUN_API_KEY: "",
      MAILGUN_DOMAIN: "",
      FROM_EMAIL: "",
    },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}