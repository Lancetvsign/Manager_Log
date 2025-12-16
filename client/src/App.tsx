/**
 * APPLICATION ENTRY POINT
 * =======================
 * This is the main entry point for the Restaurant Manager's Log application.
 * 
 * STANDALONE MODE (Development):
 * - Uses "default" as clubId
 * - Runs on its own with full functionality
 * 
 * EMBEDDED MODE (Social Club Pro):
 * - Parses URL parameters for SSO embed
 * - Verifies signature with backend
 * - Uses authenticated user data
 * 
 * URL Parameters (embed mode):
 * - clubId, userId, userRole, clubName, firstName, lastName, membershipNumber
 * - timestamp, signature (for verification)
 */

import { useState, useEffect } from "react";
import { ManagerLogModule } from "./ManagerLogModule";

interface EmbedUser {
  clubId: string;
  userId: string;
  userRole: string;
  clubName: string;
  firstName: string;
  lastName: string;
  membershipNumber: string;
  fullName: string;
}

function App() {
  const [embedUser, setEmbedUser] = useState<EmbedUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkEmbedParams() {
      const params = new URLSearchParams(window.location.search);
      
      const clubId = params.get("clubId");
      const signature = params.get("signature");
      
      if (!clubId || !signature) {
        setIsLoading(false);
        return;
      }

      const embedParams = {
        clubId: params.get("clubId") || "",
        userId: params.get("userId") || "",
        userRole: params.get("userRole") || "",
        clubName: decodeURIComponent(params.get("clubName") || ""),
        firstName: params.get("firstName") || "",
        lastName: params.get("lastName") || "",
        membershipNumber: params.get("membershipNumber") || "",
        timestamp: params.get("timestamp") || "",
        signature: params.get("signature") || "",
      };

      try {
        const response = await fetch("/api/auth/verify-embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(embedParams),
        });

        if (!response.ok) {
          const data = await response.json();
          setError(data.error || "Authentication failed");
          setIsLoading(false);
          return;
        }

        const { user } = await response.json();
        setEmbedUser(user);
      } catch (err) {
        setError("Failed to verify authentication");
      } finally {
        setIsLoading(false);
      }
    }

    checkEmbedParams();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-destructive">{error}</div>
      </div>
    );
  }

  if (embedUser) {
    return (
      <ManagerLogModule
        clubId={embedUser.clubId}
        clubName={embedUser.clubName}
        userId={embedUser.userId}
        managerName={embedUser.fullName}
        membershipNumber={embedUser.membershipNumber}
        userRole={embedUser.userRole}
        apiBaseUrl=""
      />
    );
  }

  return (
    <ManagerLogModule
      clubId="default"
      clubName="Development Mode"
      apiBaseUrl=""
    />
  );
}

export default App;
