# Restaurant Manager's Log

## Overview

A restaurant management application designed for daily operational tracking and reporting, built as an embeddable module for Social Club Pro. The system supports multi-club deployment with clubId-based data isolation, enables restaurant managers to log daily sales data (food, bar, and gaming), track weather conditions with year-over-year comparisons, maintain operational notes, and manage maintenance items. Features the Social Club Pro teal color scheme for visual consistency.

## User Preferences

Preferred communication style: Simple, everyday language.

## Key Files

This section provides a quick reference to the most important files in the codebase:

### Schema & Models
- **`shared/schema.ts`** - Database schema definitions using Drizzle ORM. Defines ManagerLog (with clubId) and MaintenanceItem tables with relationships and Zod validation schemas.
- **`shared/types.ts`** - TypeScript types for module props and API responses.
- **`shared/theme.ts`** - Social Club Pro theme configuration (colors, styling constants).

### Backend
- **`server/routes.ts`** - All API endpoints with clubId filtering. Includes manager logs CRUD, maintenance items CRUD, and weather API integration.
- **`server/storage.ts`** - Database access layer implementing the Repository pattern. All queries filter by clubId for multi-club support.
- **`server/db.ts`** - Database connection configuration using Neon serverless PostgreSQL.

### Frontend - Module Architecture
- **`client/src/ManagerLogModule.tsx`** - Main entry point for embedding. Wraps app with providers and context.
- **`client/src/contexts/ManagerLogContext.tsx`** - React Context for clubId, apiBaseUrl, and other module props.
- **`client/src/App.tsx`** - Standalone development entry (uses ManagerLogModule with default clubId).

### Frontend Pages & Components
- **`client/src/pages/ManagerLogHome.tsx`** - Main application shell with 4-tab navigation (New Entry, Log History, To-Do List, Insights).
- **`client/src/components/ManagerLogForm.tsx`** - Form for creating/editing daily log entries with weather integration.
- **`client/src/components/ManagerLogList.tsx`** - History view with filters, search, and detail view for logs.
- **`client/src/components/MaintenanceOverview.tsx`** - Consolidated view of all to-do items across all days with status/date filters.
- **`client/src/components/InsightsPage.tsx`** - Analytics dashboard with sales trends, to-do status charts, and top performing days.

## Multi-Club Architecture

### Embedding in Social Club Pro

The application is designed to be embedded as a module in Social Club Pro:

```tsx
import { ManagerLogModule } from './manager-log/ManagerLogModule';

function ClubDashboard({ club, user }) {
  return (
    <ManagerLogModule
      clubId={club.id}           // Required: Unique club identifier
      clubName={club.name}       // Optional: Display name
      managerName={user.name}    // Optional: Pre-filled manager name
      apiBaseUrl="/manager-log"  // Optional: API mount point
    />
  );
}
```

### Data Isolation

All data is scoped by `clubId`:
- Database schema includes `clubId` column on `manager_logs` table
- All API endpoints accept `clubId` as query parameter
- Frontend components use ManagerLogContext to access clubId
- Queries and mutations automatically include clubId for proper data isolation

### API Query Parameters

All manager log endpoints support `clubId` query parameter:
- `GET /api/manager-logs?clubId=club123`
- `GET /api/manager-logs/by-date/2025-12-02?clubId=club123`
- `POST /api/manager-logs` (clubId in request body)

## System Architecture

### Frontend Architecture

**React SPA with Vite Build System**
- Single-page application using React 18 with TypeScript
- Vite as the development server and build tool for fast HMR and optimized production builds
- Component-based architecture with reusable UI components

**UI Component System**
- shadcn/ui component library using Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Social Club Pro teal theme: primary color hsl(174, 83.9%, 31.6%)
- Dark header with teal background for consistent branding
- Typography uses Inter font from Google Fonts

**State Management**
- TanStack Query (React Query) for server state management and data fetching
- React Context (ManagerLogContext) for module configuration
- Local component state using React hooks
- Query client configured with custom fetch wrapper for API requests

**Form Handling**
- React Hook Form with Zod schema validation
- Integration with shadcn/ui form components via @hookform/resolvers

### Backend Architecture

**Express.js REST API**
- Node.js runtime with Express framework
- TypeScript throughout the codebase
- Modular route registration pattern
- Custom error handling middleware
- Request/response logging for API endpoints

**Database Layer**
- Drizzle ORM for type-safe database operations
- Neon Serverless PostgreSQL as the database provider
- WebSocket support for Neon serverless connections
- Schema-first approach with migrations in `/migrations` directory

**Data Models**
- **Users**: Authentication and user management (prepared for future auth)
- **Manager Logs**: Daily operational logs with sales data, weather, and notes
  - Fields: id, clubId, logDate (unique per club), dayOfWeek, managerName, weather, weatherLastYear, foodSales, barSales, gamingSales, totalSales, salesNotes, dailyNumber, weeklyNumber, dailyNotes, createdAt, updatedAt
- **Maintenance Items**: Tracked maintenance tasks linked to specific log entries
  - Fields: id, managerLogId (FK), description, status (open/completed), notes, createdAt, resolvedAt
- Relational structure with cascading deletes for maintenance items

**Storage Pattern**
- Repository pattern with `IStorage` interface abstraction
- `DatabaseStorage` implementation using Drizzle ORM
- CRUD operations for all entities with clubId filtering
- Upsert support for manager logs (create or update based on date+clubId uniqueness)

### External Dependencies

**Weather Data Integration**
- Open-Meteo API (free weather service) for both current and historical weather data
- Fallback to random data when API is unavailable
- Supports geolocation coordinates (defaults to NYC: 40.7128, -74.0060)
- Weather code mapping to human-readable conditions
- Historical weather lookups for year-over-year comparisons

**Database**
- Neon Serverless PostgreSQL (cloud-hosted)
- Connection pooling via @neondatabase/serverless
- Environment variable `DATABASE_URL` required for connection
- Drizzle Kit for schema migrations and database management

**Third-Party Libraries**
- Radix UI: Accessible component primitives
- date-fns: Date manipulation and formatting
- Zod: Runtime schema validation
- nanoid: Unique ID generation
- class-variance-authority & clsx: Conditional class name utilities

**Development Tools**
- tsx: TypeScript execution for development
- esbuild: Production bundling for server code
- Replit integration plugins for development environment

### API Structure

**RESTful Endpoints**

Manager Logs (all support `?clubId=` query parameter):
- `GET /api/manager-logs` - Get all logs for club (sorted by date descending)
- `GET /api/manager-logs/:id` - Get single log by ID
- `GET /api/manager-logs/by-date/:date` - Get log by date (YYYY-MM-DD)
- `GET /api/manager-logs/range/:startDate/:endDate` - Get logs in date range
- `POST /api/manager-logs` - Create or update log (upsert by date+clubId)
- `PATCH /api/manager-logs/:id` - Partial update
- `DELETE /api/manager-logs/:id` - Delete log (cascades to maintenance items)

Maintenance Items (all support `?clubId=` query parameter):
- `GET /api/maintenance-items` - Get all items with optional filters (status, startDate, endDate, clubId)
- `GET /api/manager-logs/:logId/maintenance` - Get items for a specific log
- `POST /api/maintenance-items` - Create new item
- `PATCH /api/maintenance-items/:id` - Update item (auto-sets resolvedAt when completed)
- `DELETE /api/maintenance-items/:id` - Delete item

Weather:
- `GET /api/weather/current` - Current weather data
- `GET /api/weather/current/formatted` - Current weather as formatted string
- `GET /api/weather/historical?date=YYYY-MM-DD` - Weather from 1 year ago
- `GET /api/weather/historical/formatted?date=YYYY-MM-DD` - Historical weather as formatted string

Metrics (all support `?clubId=` query parameter):
- `GET /api/metrics?clubId=...&startDate=...&endDate=...` - Aggregated metrics for the Insights page
  - Returns: summary (daysWithLogs, totalSales, averageDailySales, openToDo, completedToDo)
  - Returns: dailySales array for chart visualization
  - Returns: toDoStatus counts (open vs completed)
  - Returns: topDays array with highest sales and notes snippets

**Data Flow**
1. Client makes requests via TanStack Query with clubId from context
2. Custom `buildApiUrl` helper appends clubId to all API calls
3. Express routes process requests, validate with Zod, filter by clubId
4. Storage layer interacts with database via Drizzle ORM with clubId scoping
5. Responses cached client-side with clubId in query keys
6. Toast notifications for user feedback on mutations

## Recent Changes

### December 2, 2025 - Advanced Insights & Analytics Features
- Added **Comparison Mode** for period-over-period analysis
  - Compare to: Previous Period, Previous Month, Previous Year, Custom Range
  - Overlay comparison data on Sales Trend chart (dashed line)
  - % change indicators on summary cards (with trend icons)
  - Second API call for comparison data handled client-side
- Added **Sales Heatmap Calendar** (GitHub-style contribution chart)
  - Days colored by sales intensity (0-4 levels)
  - Click on day to view log details
  - Compact grid for 7-30 day ranges, full calendar for longer ranges
- Added **Sales by Weekday** bar chart
  - Aggregates sales by day of week (Sun-Sat)
  - Shows total and average sales per weekday
- Added **Chart Customization Options** per chart
  - Toggle gridlines, data labels, animations
  - Corner style (rounded/straight) for bar charts
  - Line smoothing (curved/straight) for line/area charts
  - Color theme selector (Default SCP Teal, Monochrome, Multi-color, High Contrast)
- Added **Chart Export** functionality (PNG/PDF)
  - Uses html2canvas and jsPDF libraries
  - Includes chart title, date range, and club name in exports
- Added **Collapsible Sections** with localStorage persistence
  - Summary, Sales Trend, Heatmap, To-Do Insights, Weekday Analysis, Top Days
  - State persisted across sessions
- Added **comprehensive TypeScript types** for new features
  - ChartOptions, ChartColorTheme, ChartSmoothing, ChartCornerStyle
  - ComparisonPeriod, ComparisonMetrics, ComparisonData
  - HeatmapDay, WeekdaySalesData, ChartExportConfig, InsightsSectionState
- New chart components in `/client/src/components/charts/`:
  - ChartOptionsPopover.tsx, ChartExportButton.tsx, CollapsibleSection.tsx
  - ComparisonModeSelector.tsx, SalesHeatmapCalendar.tsx, WeekdaySalesChart.tsx

### December 2, 2025 - Insights/Analytics Page (Base)
- Added **Insights page** as fourth tab in navigation
  - Summary cards: Days logged, Total sales, Average daily sales, To-Do status
  - Sales trend chart with multiple types (Line, Bar, Area)
  - Granularity controls (Daily, Weekly, Monthly)
  - To-Do status pie chart (Open vs Completed with percentages)
  - Sales breakdown pie chart (Food, Bar, Gaming)
  - Top performing days table with View Log navigation
- Added **date range filters** for all metrics
  - Presets: Last 7 Days, Last 30 Days, This Month
  - Custom range with date pickers
- Added **Reset Filters** button and **Export CSV** functionality
- Added **metrics API endpoint** (`GET /api/metrics`)
  - Accepts clubId, startDate, endDate query parameters
  - Returns aggregated summary, daily sales array, to-do status, top days, salesByCategory
- Added **TypeScript types** for metrics response in shared/schema.ts
  - MetricsSummary, DailySalesData, ToDoStatus, TopDayData, SalesByCategory, MetricsResponse
- Renamed all "Maintenance" references to "To-Do List" for clarity

### December 2, 2025 - Multi-Club Architecture & Social Club Pro Integration
- Added **clubId-based data isolation** for multi-club deployment
  - Added `clubId` column to `manager_logs` table (NOT NULL with default)
  - Updated all storage layer methods to filter by clubId
  - All API endpoints now accept `clubId` query parameter
- Created **ManagerLogModule** wrapper component for embedding
  - React Context (ManagerLogContext) provides clubId, apiBaseUrl to all components
  - `buildApiUrl` helper ensures all API calls include clubId
  - Simplified App.tsx uses ManagerLogModule with default clubId for development
- Applied **Social Club Pro teal theme**
  - Primary color: hsl(174, 83.9%, 31.6%) 
  - Dark teal header background
  - Updated CSS variables in index.css
- Added **shared types and theme configuration**
  - `shared/types.ts` - ManagerLogModuleProps and API types
  - `shared/theme.ts` - Theme constants for consistent styling
- Renamed `Home.tsx` to `ManagerLogHome.tsx` for module clarity

### December 2, 2025 - Earlier Changes
- Added **Maintenance Overview page** as third tab in navigation
  - Shows all maintenance items across all days
  - Filters by status (All, Open, Completed) and date range (Last 7 Days, Last 30 Days, All Time)
  - "View Log" button navigates to History detail view for that log
- Added **comprehensive code documentation** to all key files
  - JSDoc comments explaining purpose, data flow, and key decisions
  - Inline comments for complex logic
- Added `GET /api/maintenance-items` endpoint with join query to include log dates
- Added `MaintenanceItemWithLog` type for maintenance items with log information
- Fixed cross-tab navigation using useRef guard to prevent re-triggering on data refetch
