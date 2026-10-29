import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import type { AddressInfo } from "node:net";
import express from "express";
import { registerRoutes } from "../server/routes";
import { generateSignature, issueSessionToken, requireSignedRequest } from "../server/auth";
import { resetSalesDatabase } from "./support/sales-database";

const secret = "auth-test-secret";
const standalonePassword = "club-password";
let server: Awaited<ReturnType<typeof registerRoutes>>;
let base: string;

before(async () => {
  process.env.MANAGER_LOG_SECRET = secret;
  process.env.STANDALONE_PASSWORD = standalonePassword;
  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  // Mounted the same way as server/index.ts
  app.use("/api", (req, res, next) =>
    req.path === "/auth/verify-embed" || req.path === "/auth/standalone-login"
      ? next()
      : requireSignedRequest(req, res, next));
  server = await registerRoutes(app);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
});
beforeEach(() => {
  resetSalesDatabase();
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

test("unsigned requests are rejected even when they target the default club", async () => {
  const { status } = await call("GET", "/api/club-budget?clubId=default");
  assert.equal(status, 401);
});

test("direct sign-in with the shared password gives a default-club session", async () => {
  await call("PUT", "/api/club-budget", session("club-a"), { cateringSales: "100" });
  const login = await call("POST", "/api/auth/standalone-login", {}, { password: standalonePassword });
  assert.equal(login.status, 200);
  assert.equal(login.data.clubId, "default");

  // Pointing the query at club-a still only reaches the default club
  const headers = { "X-Manager-Log-Session": login.data.sessionToken };
  await call("PUT", "/api/club-budget?clubId=club-a", headers, { cateringSales: "7" });
  const a = await call("GET", "/api/club-budget", session("club-a"));
  const d = await call("GET", "/api/club-budget", session("default"));
  assert.equal(Number(a.data.cateringSales), 100);
  assert.equal(Number(d.data.cateringSales), 7);
});

test("direct sign-in rejects a wrong password and locks out after 10 failures", async () => {
  const headers = { "X-Forwarded-For": "203.0.113.9" };
  for (let i = 0; i < 10; i++) {
    const { status } = await call("POST", "/api/auth/standalone-login", headers, { password: "wrong" });
    assert.equal(status, 401);
  }
  const locked = await call("POST", "/api/auth/standalone-login", headers, { password: standalonePassword });
  assert.equal(locked.status, 429);
});

test("direct sign-in is off when STANDALONE_PASSWORD is not set", async () => {
  delete process.env.STANDALONE_PASSWORD;
  try {
    const { status } = await call("POST", "/api/auth/standalone-login", {}, { password: "" });
    assert.equal(status, 503);
  } finally {
    process.env.STANDALONE_PASSWORD = standalonePassword;
  }
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
