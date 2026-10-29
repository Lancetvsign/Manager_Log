import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { registerRoutes } from "../server/routes";
import { generateSignature, issueSessionToken, requireSignedRequest } from "../server/auth";
import { resetSalesDatabase } from "./support/sales-database";

const secret = "auth-test-secret";
let server: Awaited<ReturnType<typeof registerRoutes>>;
let base: string;

before(async () => {
  process.env.MANAGER_LOG_SECRET = secret;
  const app = express();
  app.use(express.json());
  // Mounted the same way as server/index.ts
  app.use("/api", (req, res, next) =>
    req.path === "/auth/verify-embed" ? next() : requireSignedRequest(req, res, next));
  server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  delete process.env.ALLOW_STANDALONE_ACCESS;
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  resetSalesDatabase();
  delete process.env.ALLOW_STANDALONE_ACCESS;
});

async function call(method: string, path: string, headers: Record<string, string> = {}, body?: unknown) {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  let data: any = text;
  try { data = JSON.parse(text); } catch {}
  return { status: response.status, data };
}

const session = (clubId: string) => ({ "X-Manager-Log-Session": issueSessionToken(clubId, secret).token });

test("unauthenticated API requests are rejected outside development", async () => {
  const { status } = await call("GET", "/api/club-budget?clubId=club-a");
  assert.equal(status, 401);
});

test("a session token pins every request to its own club, ignoring ?clubId= and body clubId", async () => {
  await call("PUT", "/api/club-budget?clubId=club-a", session("club-a"), { cateringSales: "100" });
  // Club B tries to read and overwrite club A by pointing the query and body at it
  await call("PUT", "/api/club-budget?clubId=club-a", session("club-b"), { clubId: "club-a", cateringSales: "999" });

  const a = await call("GET", "/api/club-budget?clubId=club-a", session("club-a"));
  const bReadingA = await call("GET", "/api/club-budget?clubId=club-a", session("club-b"));
  assert.equal(a.status, 200);
  assert.equal(Number(a.data.cateringSales), 100);
  assert.equal(Number(bReadingA.data.cateringSales), 999, "club B only ever sees its own budget");
});

test("tampered, expired or foreign-secret session tokens are rejected", async () => {
  const { token } = issueSessionToken("club-a", secret);
  const [v, club, exp, mac] = token.split(".");
  const tampered = [v, Buffer.from("club-b").toString("base64url"), exp, mac].join(".");
  const expired = issueSessionToken("club-a", secret, Date.now() - 13 * 60 * 60 * 1000).token;
  const foreign = issueSessionToken("club-a", "other-secret").token;
  for (const bad of [tampered, expired, foreign, "garbage", `${v}.${club}.${exp}.zz`]) {
    const { status } = await call("GET", "/api/club-budget", { "X-Manager-Log-Session": bad });
    assert.equal(status, 401, bad);
  }
});

test("signed SCP requests still work and are pinned to the signed X-Club-Id", async () => {
  const path = "/api/club-budget?clubId=club-a";
  const { timestamp, signature } = generateSignature("GET", path, undefined, "club-b", secret);
  const ok = await call("GET", path, { "X-Timestamp": timestamp, "X-Signature": signature, "X-Club-Id": "club-b" });
  assert.equal(ok.status, 200);

  const forged = await call("GET", path, { "X-Timestamp": timestamp, "X-Signature": signature, "X-Club-Id": "club-a" });
  assert.equal(forged.status, 401);
});

test("ALLOW_STANDALONE_ACCESS confines unsigned requests to the default club", async () => {
  await call("PUT", "/api/club-budget?clubId=club-a", session("club-a"), { cateringSales: "100" });
  process.env.ALLOW_STANDALONE_ACCESS = "true";
  const read = await call("GET", "/api/club-budget?clubId=club-a");
  assert.equal(read.status, 200);
  assert.notEqual(Number(read.data?.cateringSales ?? 0), 100, "standalone access must not reach club-a");
});

test("verify-embed returns a session token for a valid embed signature", async () => {
  const crypto = await import("node:crypto");
  const params = {
    clubId: "club-a", userId: "5", userRole: "manager", clubName: "Eagle Lodge",
    firstName: "Pat", lastName: "Lee", membershipNumber: "EL-1", timestamp: Date.now().toString(),
  };
  const payload = ["EMBED", params.timestamp, params.clubId, params.userId, params.userRole,
    params.clubName, params.firstName, params.lastName, params.membershipNumber].join("\n");
  const signature = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const { status, data } = await call("POST", "/api/auth/verify-embed", {}, { ...params, signature });
  assert.equal(status, 200);
  const use = await call("GET", "/api/club-budget", { "X-Manager-Log-Session": data.sessionToken });
  assert.equal(use.status, 200);
});

test("/uploads cannot read files outside the uploads folder", async () => {
  for (const p of ["/uploads/..%2Fpackage.json", "/uploads/..%2F..%2F..%2F..%2F..%2F..%2Fetc%2Fhosts", "/uploads/.."]) {
    const { status, data } = await call("GET", p);
    assert.equal(status, 404, `${p} -> ${String(data).slice(0, 60)}`);
  }
});
