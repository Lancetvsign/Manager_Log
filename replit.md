# Restaurant Manager's Log

## Overview

A restaurant management application designed for daily operational tracking and reporting. The system enables restaurant managers to log daily sales data (food, bar, and gaming), track weather conditions with year-over-year comparisons, maintain operational notes, and manage maintenance items. The application provides a productivity-focused interface for capturing and analyzing daily restaurant performance metrics.

## User Preferences

Preferred communication style: Simple, everyday language.

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
- **Users**: Authentication and user management
- **Manager Logs**: Daily operational logs with sales data, weather, and notes
- **Maintenance Items**: Tracked maintenance tasks linked to specific log entries
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
- `/api/manager-logs` - CRUD operations for daily logs
- `/api/manager-logs/:id` - Individual log operations
- `/api/maintenance-items` - Maintenance task management
- Weather data fetched server-side and included in log responses

**Data Flow**
1. Client makes requests via TanStack Query
2. Custom `apiRequest` wrapper handles fetch with credentials
3. Express routes process requests
4. Storage layer interacts with database via Drizzle
5. Responses cached client-side until manually invalidated
6. Toast notifications for user feedback on mutations