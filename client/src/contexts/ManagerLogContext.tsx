/**
 * MANAGER LOG CONTEXT
 * ===================
 * React Context that provides club configuration to all child components.
 * 
 * This context makes clubId, managerName, clubName, and apiBaseUrl available
 * throughout the component tree without prop drilling.
 * 
 * HOW IT WORKS:
 * 1. ManagerLogModule wraps the app in ManagerLogProvider
 * 2. Child components call useManagerLog() to access the config
 * 3. API calls include clubId from context for proper data isolation
 * 
 * EXAMPLE USAGE IN COMPONENTS:
 * ```tsx
 * function MyComponent() {
 *   const { clubId, apiBaseUrl } = useManagerLog();
 *   
 *   // Use in API calls
 *   const response = await fetch(`${apiBaseUrl}/api/manager-logs?clubId=${clubId}`);
 * }
 * ```
 */

import { createContext, useContext, type ReactNode } from "react";
import type { ManagerLogContextValue } from "@shared/types";

const ManagerLogContext = createContext<ManagerLogContextValue | null>(null);

interface ManagerLogProviderProps {
  children: ReactNode;
  value: ManagerLogContextValue;
}

/**
 * Provider component that wraps the Manager Log module
 * and makes club configuration available to all child components.
 */
export function ManagerLogProvider({ children, value }: ManagerLogProviderProps) {
  return (
    <ManagerLogContext.Provider value={value}>
      {children}
    </ManagerLogContext.Provider>
  );
}

/**
 * Hook to access the Manager Log context.
 * Must be used within a ManagerLogProvider.
 * 
 * @returns The context value containing clubId, managerName, clubName, apiBaseUrl
 * @throws Error if used outside of ManagerLogProvider
 */
export function useManagerLog(): ManagerLogContextValue {
  const context = useContext(ManagerLogContext);
  
  if (!context) {
    throw new Error(
      "useManagerLog must be used within a ManagerLogProvider. " +
      "Make sure you're using the ManagerLogModule component as the root."
    );
  }
  
  return context;
}

/**
 * Helper function to build API URLs with clubId parameter.
 * Use this in API calls to ensure proper multi-tenant isolation.
 * 
 * @param path - The API path (e.g., "/api/manager-logs")
 * @param clubId - The club identifier
 * @param apiBaseUrl - The base URL (optional, defaults to "")
 * @param additionalParams - Additional query parameters to include
 * @returns The full URL with clubId query parameter
 * 
 * EXAMPLE:
 * ```ts
 * const url = buildApiUrl("/api/manager-logs", "club_123", "", { status: "open" });
 * // Returns: "/api/manager-logs?clubId=club_123&status=open"
 * ```
 */
export function buildApiUrl(
  path: string,
  clubId: string,
  apiBaseUrl: string = "",
  additionalParams?: Record<string, string>
): string {
  const params = new URLSearchParams({ clubId });
  
  if (additionalParams) {
    Object.entries(additionalParams).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        params.append(key, value);
      }
    });
  }
  
  return `${apiBaseUrl}${path}?${params.toString()}`;
}
