/**
 * MANAGER LOG MODULE
 * ==================
 * The main entry point component for embedding the Manager Log in Social Club Pro.
 * 
 * This component wraps the entire Manager Log application and provides:
 * - Club-scoped data isolation via React Context
 * - Configurable API base URL for different deployment scenarios
 * - Pre-filled manager name from the parent application
 * 
 * INTEGRATION WITH SOCIAL CLUB PRO:
 * ---------------------------------
 * Import and use this component in the Social Club Pro application:
 * 
 * ```tsx
 * import { ManagerLogModule } from './manager-log/ManagerLogModule';
 * 
 * function ClubDashboard({ club, user }) {
 *   return (
 *     <ManagerLogModule
 *       clubId={club.id}
 *       clubName={club.name}
 *       managerName={user.name}
 *       apiBaseUrl="/manager-log"
 *     />
 *   );
 * }
 * ```
 * 
 * PROPS:
 * - clubId (required): Unique identifier for the club. All data is scoped to this ID.
 * - clubName (optional): Display name shown in the header.
 * - managerName (optional): Pre-filled manager name for new log entries.
 * - apiBaseUrl (optional): Base URL for API calls (default: "").
 * 
 * HOW TO CHANGE THE API BASE URL:
 * -------------------------------
 * If the Manager Log APIs are mounted under a different path in Social Club Pro,
 * pass the apiBaseUrl prop:
 * 
 * - Default: API calls go to "/api/manager-logs"
 * - With apiBaseUrl="/manager-log": Calls go to "/manager-log/api/manager-logs"
 */

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ManagerLogProvider } from "./contexts/ManagerLogContext";
import ManagerLogHome from "./pages/ManagerLogHome";
import type { ManagerLogModuleProps } from "@shared/types";

/**
 * Main entry component for the Manager Log module.
 * Wraps the application with necessary providers and context.
 */
export function ManagerLogModule({
  clubId,
  clubName,
  userId,
  managerName,
  membershipNumber,
  userRole,
  apiBaseUrl = "",
  clubCity,
  clubProvince,
  clubCountry,
  returnUrl,
}: ManagerLogModuleProps) {
  const contextValue = {
    clubId,
    clubName,
    userId,
    managerName,
    membershipNumber,
    userRole,
    apiBaseUrl,
    clubCity,
    clubProvince,
    clubCountry,
    returnUrl,
  };

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ManagerLogProvider value={contextValue}>
          <ManagerLogHome />
        </ManagerLogProvider>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default ManagerLogModule;
