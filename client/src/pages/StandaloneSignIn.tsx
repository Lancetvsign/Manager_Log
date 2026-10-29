/**
 * STANDALONE SIGN-IN
 * ==================
 * Shown when the app is opened directly (not embedded in Social Club Pro).
 * Exchanges the shared password for a session token for the "default" club.
 */

import { useState, type FormEvent } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { setSessionToken } from "@/lib/session";

interface StandaloneSignInProps {
  onSignedIn: () => void;
  notice?: string | null;
}

export function StandaloneSignIn({ onSignedIn, notice }: StandaloneSignInProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/standalone-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Sign-in failed");
        return;
      }
      setSessionToken(data.sessionToken, { remember: true, expiresAt: data.sessionExpiresAt });
      setPassword("");
      onSignedIn();
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-background px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Manager's Log</CardTitle>
          <CardDescription>Enter the password to continue.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
            <div className="space-y-2">
              <Label htmlFor="standalone-password">Password</Label>
              <Input
                id="standalone-password"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="input-standalone-password"
              />
            </div>
            {error && <p className="text-sm text-destructive" data-testid="text-signin-error">{error}</p>}
            <Button type="submit" className="w-full" disabled={submitting || !password} data-testid="button-sign-in">
              {submitting ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
