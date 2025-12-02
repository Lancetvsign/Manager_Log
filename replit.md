# Restaurant Manager's Log

## Overview

A restaurant management application designed for daily operational tracking and reporting. The system enables restaurant managers to log daily sales data (food, bar, and gaming), track weather conditions with year-over-year comparisons, maintain operational notes, and manage maintenance items. The application provides a productivity-focused interface for capturing and analyzing daily restaurant performance metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

## Key Files

This section provides a quick reference to the most important files in the codebase:

### Schema & Models
- **`shared/schema.ts`** - Database schema definitions using Drizzle ORM. Defines ManagerLog and MaintenanceItem tables with relationships and Zod validation schemas.

### Backend
- **`server/routes.ts`** - All API endpoints with detailed documentation. Includes manager logs CRUD, maintenance items CRUD, and weather API integration.
- **`server/storage.ts`** - Database access layer implementing the Repository pattern. Contains all database queries using Drizzle ORM.
- **`server/db.ts`** - Database connection configuration using Neon serverless PostgreSQL.

### Frontend Pages & Components
- **`client/src/pages/Home.tsx`** - Main application shell with 3-tab navigation (New Entry, Log History, Maintenance).
- **`client/src/components/ManagerLogForm.tsx`** - Form for creating/editing daily log entries with weather integration.
- **`client/src/components/ManagerLogList.tsx`** - History view with filters, search, and detail view for logs.
- **`client/src/components/MaintenanceOverview.tsx`** - Consolidated view of all maintenance items across all days with status/date filters.

## System Architecture

### Frontend Architecture

**React SPA with Vite Build System**
- Single-page application using React 18 with TypeScript
- Vite as the development server and build tool for fast HMR and optimized production builds
- Wouter for lightweight client-side routing (alternative to React Router)
- Component-based architecture with reusable UI components

**UI Component System**
- shadcn/ui component library using Radix UI primitives
- Tailwind CSS for utility-first styling with custom design tokens
- Design system follows "New York" style variant with neutral color palette
- Custom CSS variables for theming (light/dark mode support)
- Typography uses Inter font from Google Fonts

**State Management**
- TanStack Query (React Query) for server state management and data fetching
- Local component state using React hooks
- Query client configured with custom fetch wrapper for API requests
- Stale-time set to Infinity for manual cache invalidation control

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
  - Fields: id, logDate (unique), dayOfWeek, managerName, weather, weatherLastYear, foodSales, barSales, gamingSales, totalSales, salesNotes, dailyNumber, weeklyNumber, dailyNotes, createdAt, updatedAt
- **Maintenance Items**: Tracked maintenance tasks linked to specific log entries
  - Fields: id, managerLogId (FK), description, status (open/completed), notes, createdAt, resolvedAt
- Relational structure with cascading deletes for maintenance items

**Storage Pattern**
- Repository pattern with `IStorage` interface abstraction
- `DatabaseStorage` implementation using Drizzle ORM
- CRUD operations for all entities
- Upsert support for manager logs (create or update based on date uniqueness)

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

Manager Logs:
- `GET /api/manager-logs` - Get all logs (sorted by date descending)
- `GET /api/manager-logs/:id` - Get single log by ID
- `GET /api/manager-logs/by-date/:date` - Get log by date (YYYY-MM-DD)
- `GET /api/manager-logs/range/:startDate/:endDate` - Get logs in date range
- `POST /api/manager-logs` - Create or update log (upsert by date)
- `PATCH /api/manager-logs/:id` - Partial update
- `DELETE /api/manager-logs/:id` - Delete log (cascades to maintenance items)

Maintenance Items:
- `GET /api/maintenance-items` - Get all items with optional filters (status, startDate, endDate)
- `GET /api/manager-logs/:logId/maintenance` - Get items for a specific log
- `POST /api/maintenance-items` - Create new item
- `PATCH /api/maintenance-items/:id` - Update item (auto-sets resolvedAt when completed)
- `DELETE /api/maintenance-items/:id` - Delete item

Weather:
- `GET /api/weather/current` - Current weather data
- `GET /api/weather/current/formatted` - Current weather as formatted string
- `GET /api/weather/historical?date=YYYY-MM-DD` - Weather from 1 year ago
- `GET /api/weather/historical/formatted?date=YYYY-MM-DD` - Historical weather as formatted string

**Data Flow**
1. Client makes requests via TanStack Query
2. Custom `apiRequest` wrapper handles fetch with credentials
3. Express routes process requests and validate with Zod schemas
4. Storage layer interacts with database via Drizzle ORM
5. Responses cached client-side until manually invalidated
6. Toast notifications for user feedback on mutations

## Recent Changes

### December 2, 2025
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
