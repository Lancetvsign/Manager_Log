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

const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

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
  const secret = process.env.MANAGER_LOG_SECRET;
  
  // In development mode, bypass auth if no signature headers are provided
  // This allows direct browser access while still validating signed SCP requests
  if (IS_DEVELOPMENT) {
    const hasSignatureHeaders = req.headers["x-signature"] && req.headers["x-timestamp"];
    if (!hasSignatureHeaders) {
      console.warn("[Auth] Development mode: No signature headers, bypassing auth.");
      return next();
    }
  }
  
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

/**
 * EMBED SSO SIGNATURE VERIFICATION
 * =================================
 * Verifies the signature on embed URL parameters from SCP.
 * 
 * The signature payload format (joined with newlines):
 * EMBED
 * {timestamp}
 * {clubId}
 * {userId}
 * {userRole}
 * {clubName}
 * {firstName}
 * {lastName}
 * {membershipNumber}
 */
export interface EmbedParams {
  clubId: string;
  userId: string;
  userRole: string;
  clubName: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
  timestamp: string;
  signature: string;
}

export interface VerifiedEmbedUser {
  clubId: string;
  userId: string;
  userRole: string;
  clubName: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
  fullName: string;
}

/**
 * Verifies embed SSO signature and returns user data if valid
 */
export function verifyEmbedSignature(params: EmbedParams, secret: string): VerifiedEmbedUser | null {
  const payload = [
    "EMBED",
    params.timestamp,
    params.clubId,
    params.userId,
    params.userRole,
    params.clubName,
    params.firstName,
    params.lastName,
    params.membershipNumber
  ].join("\n");

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(params.signature, "hex"),
      Buffer.from(expectedSignature, "hex")
    );

    if (!isValid) {
      return null;
    }

    const requestAge = Date.now() - parseInt(params.timestamp, 10);
    if (isNaN(requestAge) || requestAge > MAX_REQUEST_AGE_MS || requestAge < -MAX_REQUEST_AGE_MS) {
      return null;
    }

    return {
      clubId: params.clubId,
      userId: params.userId,
      userRole: params.userRole,
      clubName: params.clubName,
      firstName: params.firstName,
      lastName: params.lastName,
      membershipNumber: params.membershipNumber,
      fullName: `${params.firstName} ${params.lastName}`.trim()
    };
  } catch {
    return null;
  }
}
