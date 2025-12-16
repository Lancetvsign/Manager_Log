/**
 * SIGNATURE-BASED AUTHENTICATION MIDDLEWARE
 * ==========================================
 * This module provides HMAC-SHA256 signature verification for API requests
 * from Social Club Pro. All requests must include:
 * 
 * Headers:
 * - X-Timestamp: Unix timestamp (milliseconds) when request was made
 * - X-Signature: HMAC-SHA256 signature of the request
 * - X-Club-Id: The club identifier
 * 
 * Security features:
 * - Timestamp validation (rejects requests older than 5 minutes)
 * - HMAC-SHA256 signature verification
 * - Replay attack prevention via timestamp
 */

import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

const MAX_REQUEST_AGE_MS = 5 * 60 * 1000;

const DEV_MODE_BYPASS = process.env.NODE_ENV === "development" && !process.env.MANAGER_LOG_SECRET;

/**
 * Verifies the HMAC-SHA256 signature of an incoming request
 * 
 * IMPORTANT: The fullPath parameter should include both path AND query string
 * to prevent query parameter tampering attacks.
 */
function verifySignature(
  method: string,
  fullPath: string,
  timestamp: string,
  clubId: string,
  body: string,
  signature: string,
  secret: string
): boolean {
  const payload = [
    method.toUpperCase(),
    fullPath,
    timestamp,
    clubId,
    body
  ].join("\n");

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );
  } catch {
    return false;
  }
}

/**
 * Express middleware to validate signed requests
 * 
 * In development mode without a secret configured, requests are allowed through
 * with a warning. In production, all requests must be properly signed.
 */
export function requireSignedRequest(req: Request, res: Response, next: NextFunction) {
  if (DEV_MODE_BYPASS) {
    console.warn("[Auth] Development mode: Signature verification bypassed. Set MANAGER_LOG_SECRET to enable.");
    return next();
  }

  const secret = process.env.MANAGER_LOG_SECRET;
  if (!secret) {
    console.error("[Auth] MANAGER_LOG_SECRET not configured");
    return res.status(500).json({ error: "Server authentication not configured" });
  }

  const timestamp = req.headers["x-timestamp"] as string;
  const signature = req.headers["x-signature"] as string;
  const clubId = req.headers["x-club-id"] as string;

  if (!timestamp || !signature || !clubId) {
    return res.status(401).json({ 
      error: "Missing authentication headers",
      required: ["X-Timestamp", "X-Signature", "X-Club-Id"]
    });
  }

  const requestAge = Date.now() - parseInt(timestamp, 10);
  if (isNaN(requestAge) || requestAge > MAX_REQUEST_AGE_MS || requestAge < -MAX_REQUEST_AGE_MS) {
    return res.status(401).json({ 
      error: "Request timestamp expired or invalid",
      message: "Requests must be made within 5 minutes"
    });
  }

  const bodyString = req.body && Object.keys(req.body).length > 0 
    ? JSON.stringify(req.body) 
    : "";

  try {
    const fullPath = req.originalUrl;
    
    const isValid = verifySignature(
      req.method,
      fullPath,
      timestamp,
      clubId,
      bodyString,
      signature,
      secret
    );

    if (!isValid) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    (req as any).authenticatedClubId = clubId;
    
    next();
  } catch (error) {
    console.error("[Auth] Signature verification error:", error);
    return res.status(401).json({ error: "Signature verification failed" });
  }
}

/**
 * Helper to generate a signature (useful for testing)
 * 
 * IMPORTANT: The fullPath parameter must include both path AND query string
 * (e.g., "/api/logs?clubId=abc&start=2025-01-01") to prevent query tampering.
 */
export function generateSignature(
  method: string,
  fullPath: string,
  body: any,
  clubId: string,
  secret: string
): { timestamp: string; signature: string } {
  const timestamp = Date.now().toString();
  const bodyString = body ? JSON.stringify(body) : "";
  
  const payload = [
    method.toUpperCase(),
    fullPath,
    timestamp,
    clubId,
    bodyString
  ].join("\n");

  const signature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return { timestamp, signature };
}
