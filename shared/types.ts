/**
 * SHARED TYPE DEFINITIONS
 * =======================
 * This file contains TypeScript interfaces for API requests/responses
 * and component props used throughout the Manager Log module.
 * 
 * These types ensure type safety and consistency between:
 * - Frontend components
 * - API calls
 * - Backend routes
 */

import type { ManagerLog, MaintenanceItem, MaintenanceItemWithLog } from "./schema";

// Re-export database types for convenience
export type { ManagerLog, MaintenanceItem, MaintenanceItemWithLog };

/**
 * MANAGER LOG MODULE PROPS
 * ------------------------
 * Props passed to the ManagerLogModule component when embedding
 * in Social Club Pro or other parent applications.
 * 
 * USAGE EXAMPLE:
 * ```tsx
 * <ManagerLogModule
 *   clubId="club_123"
 *   clubName="Downtown Social Club"
 *   managerName="Jane Doe"
 *   apiBaseUrl="/manager-log"
 * />
 * ```
 */
export interface ManagerLogModuleProps {
  /**
   * Required: Unique identifier for the club.
   * All data is scoped to this clubId for multi-tenant isolation.
   * Example: "club_123", "downtown-social"
   */
  clubId: string;

  /**
   * Optional: Display name for the club (shown in UI header).
   * If not provided, a generic header is shown.
   */
  clubName?: string;

  /**
   * Optional: User's ID from SCP (for tracking who made entries).
   */
  userId?: string;

  /**
   * Optional: Pre-filled manager name for new log entries.
   * Useful when the parent app knows who is logged in.
   */
  managerName?: string;

  /**
   * Optional: User's membership number from SCP.
   * Example: "EL-1234"
   */
  membershipNumber?: string;

  /**
   * Optional: User's role in SCP (e.g., "manager", "admin", "staff").
   */
  userRole?: string;

  /**
   * Optional: Base URL for API calls.
   * Use this when the APIs are mounted under a different path.
   * Default: "" (uses current origin)
   * Example: "/manager-log" would make calls to "/manager-log/api/..."
   */
  apiBaseUrl?: string;
}

/**
 * API RESPONSE TYPES
 * ------------------
 * Standard response shapes from the backend API.
 */

export interface ApiError {
  error: string;
  details?: Array<{
    code: string;
    message: string;
    path: string[];
  }>;
}

export interface WeatherData {
  temperature: number;
  condition: string;
  humidity: number;
  windSpeed: number;
  description: string;
}

export interface WeatherFormattedResponse {
  weather: string;
}

/**
 * FILTER TYPES
 * ------------
 * Types for filter parameters used in list views.
 */

export interface MaintenanceFilters {
  status?: "all" | "open" | "completed";
  startDate?: string;
  endDate?: string;
}

export interface LogFilters {
  dateFilter?: "all" | "7days" | "30days" | "specific";
  specificDate?: string;
  searchQuery?: string;
}

/**
 * CONTEXT TYPE
 * ------------
 * Shape of the context provided by ManagerLogModule to child components.
 */
export interface ManagerLogContextValue {
  clubId: string;
  clubName?: string;
  userId?: string;
  managerName?: string;
  membershipNumber?: string;
  userRole?: string;
  apiBaseUrl: string;
}
