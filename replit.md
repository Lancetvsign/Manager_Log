# Restaurant Manager's Log

## Overview
A restaurant management application designed for daily operational tracking and reporting. This embeddable module for Social Club Pro supports multi-club deployment with `clubId`-based data isolation, allowing restaurant managers to log daily sales (food, bar, gaming), track weather with year-over-year comparisons, maintain operational notes, and manage maintenance items. The system includes advanced analytics for insights into sales trends, to-do status, and performance comparisons, all while adhering to the Social Club Pro teal color scheme for visual consistency.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
The frontend is a React 18 Single-Page Application (SPA) built with Vite. It utilizes a component-based architecture with `shadcn/ui` (built on Radix UI) and Tailwind CSS for styling, adhering to the Social Club Pro teal theme (primary color `hsl(174, 83.9%, 31.6%)`) and Inter font. State management is handled by TanStack Query for server state and React Context (`ManagerLogContext`) for module configuration. Form handling uses React Hook Form with Zod for validation.

### Backend Architecture
The backend is an Express.js REST API built with Node.js and TypeScript. It features modular route registration, custom error handling, and request/response logging. The database layer uses Drizzle ORM for type-safe operations with Neon Serverless PostgreSQL, following a schema-first approach with migrations. Data models include Manager Logs (with sales, weather, notes) and Maintenance Items, both scoped by `clubId` for multi-club support. A Repository pattern abstracts database interactions.

### Multi-Club Architecture
The application is designed as an embeddable module within Social Club Pro. Data isolation is achieved by including a `clubId` column in the database schema and filtering all API endpoints and storage operations by `clubId`. A `ManagerLogModule` React component serves as the entry point, providing `clubId` and `apiBaseUrl` via `ManagerLogContext` to ensure all API calls are properly scoped.

### UI/UX Decisions
The application features a dark header with a teal background for consistent branding. The UI incorporates shadcn/ui components for a polished look. The Insights page includes interactive charts (line, bar, area) with customizable options (granularity, comparison modes, chart types, color themes, export functionality) and collapsible sections with persistence. All UI elements adhere to the Social Club Pro visual identity.

### Feature Specifications
- **Daily Manager Logs**: Track food, bar, gaming sales, weather, and operational notes.
- **Maintenance Tracking**: Manage to-do items linked to log entries, with status and date filters.
- **Weather Integration**: Display current and historical weather data (year-over-year comparison).
- **Insights & Analytics**:
    - Summary cards (Days logged, Total sales, Average daily sales, To-Do status).
    - Sales trend charts with daily, weekly, monthly granularity.
    - Comparison Mode: Period-over-period analysis (previous period, month, year, custom range).
    - Sales Heatmap Calendar: Visualizes sales intensity by day.
    - Sales by Weekday chart.
    - To-Do status and Sales breakdown pie charts.
    - Top performing days table.
    - Date range filtering, export (CSV, PNG/PDF), and chart customization.

## External Dependencies

### Weather Data
- **Open-Meteo API**: Used for fetching current and historical weather data, with a fallback to random data if unavailable.

### Database
- **Neon Serverless PostgreSQL**: Cloud-hosted relational database, managed with Drizzle ORM and `DATABASE_URL` environment variable for connection.

### Third-Party Libraries
- **Radix UI**: Accessible component primitives for `shadcn/ui`.
- **date-fns**: Library for date manipulation and formatting.
- **Zod**: Runtime schema validation for data integrity.
- **nanoid**: For generating unique IDs.
- **class-variance-authority & clsx**: Utilities for conditional CSS class names.
- **TanStack Query (React Query)**: For server state management and data fetching.
- **React Hook Form**: For form management, integrated with Zod for validation.
- **html2canvas & jsPDF**: For client-side chart export functionality (PNG/PDF).

### Development Tools
- **Vite**: Frontend build tool and development server.
- **tsx**: TypeScript execution for development.
- **esbuild**: Production bundling for server code.
- **Drizzle Kit**: For database schema migrations.
- **nodemailer**: SMTP email sending for notifications.

## Email Notification Feature

### Overview
The system supports email notifications when a manager log is saved. Managers can add recipient email addresses and the system sends a professional HTML email with the log summary.

### Configuration
Email notifications require SMTP configuration via environment variables:
- `SMTP_HOST`: SMTP server hostname (e.g., smtp.gmail.com)
- `SMTP_PORT`: SMTP port (default: 587)
- `SMTP_USER`: SMTP authentication username
- `SMTP_PASSWORD`: SMTP authentication password
- `FROM_EMAIL`: Sender email address (defaults to SMTP_USER)
- `FROM_NAME`: Sender display name (default: "Manager Log")

### API Endpoints
- `GET /api/notifications/status` - Returns { configured: boolean }
- `GET /api/notifications/lists?clubId=X` - Returns notification lists for a club (mocked for development)
- `POST /api/logs/:logId/notify` - Sends email notification for a log entry
  - Body: { reason, listIds[], subject?, message?, clubId? }
  - Returns: { success: boolean, sentTo: number }

### Notification List Model (Social Club Pro Integration)
In production, notification lists are managed by Social Club Pro. For development, mock data is provided:
- Lists have `id`, `clubId`, `name`, `description`, `isDefault`, and `recipients[]`
- Recipients have `id`, `name`, `email`

### UI Behavior
- When SMTP is configured, an "Email Notification" card appears in the form
- Toggle switch to enable/disable sending notifications on save
- Notification lists displayed as selectable cards with recipient counts
- Reason selector (FYI, Urgent, Action Required, Follow Up, Good News)
- Optional custom message field
- Professional HTML email template includes custom message, sales data, weather, and notes

## Recent Changes

### December 9, 2025 - Notification List Integration
- Integrated with Social Club Pro's notification list architecture
- API endpoints for fetching notification lists and sending with list IDs
- UI updated to show notification lists with checkboxes instead of manual email entry
- Added reason selector and optional custom message fields
- Email template includes custom message section at top