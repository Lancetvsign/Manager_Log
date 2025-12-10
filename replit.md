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
- Lists have `id`, `clubId`, `name`, `description`, `isDefault`, `roleKey`, and `recipients[]`
- `roleKey` assigns a role to the list for automation targeting: `core_team`, `maintenance`, `ownership`, `kitchen_staff`, `custom`, or `null` (None)
- Recipients have `id`, `name`, `email`
- Role selector dropdown in Notification Settings page allows assigning roles to each list

### UI Behavior
- "Notify Core Team" card appears when editing an existing log entry
- Radio buttons for reason (Maintenance, Behavior, Other)
- Multi-select listbox for notification lists with Ctrl/Cmd support for multiple selection
- Auto-populated subject and message based on log data
- Dedicated "Send Urgent Email" button (red/destructive style)
- Works in simulation mode when SMTP not configured - logs to console and shows "(simulated)" feedback
- Professional HTML email template includes reason, date, manager, sales, custom message, and log link

### Database Schema
The `notification_logs` table stores an audit trail of all notifications:
- `id`: Auto-incrementing primary key
- `log_id`: Foreign key to manager_logs
- `club_id`: Club identifier for data isolation
- `reason`: Notification type (Maintenance, Behavior, Other)
- `subject`: Email subject line
- `message`: Custom message content
- `list_ids`: JSON array of notification list IDs
- `recipients`: JSON array of email addresses
- `simulated`: Boolean indicating if email was simulated or actually sent
- `created_at`: Timestamp when notification was sent

## Escalation Rules / Smart Automations

### Overview
The escalation rules feature allows clubs to configure automated notifications based on triggers. The system uses a preset-based model for common scenarios with an optional advanced mode for custom rules.

### Automation Presets
Four built-in presets with on/off toggle switches:
- **Maintenance Alerts**: When "Maintenance" reason is selected, notify Maintenance list
- **Behavior Incident Alerts**: When "Behavior" reason is selected, notify Core Team + Ownership
- **Sales Drop Warning**: Alert when total sales drop more than X% vs last week (configurable threshold)
- **Gaming Outage Alert**: When gaming outage is flagged, notify technician list

### Database Schema
The `escalation_rules` table stores automation rules:
- `id`: Auto-incrementing primary key
- `club_id`: Club identifier for data isolation
- `name`: Human-readable rule name
- `trigger_type`: Type of trigger ("reason", "metric", "flag")
- `trigger_reason`: For reason-based triggers ("maintenance", "behavior", "other")
- `metric_key`: For metric-based triggers (e.g., "sales_drop_pct")
- `metric_threshold`: Threshold value for metric triggers
- `flag_key`: For flag-based triggers (e.g., "gaming_outage")
- `auto_send`: Whether to send notifications automatically
- `enabled`: Soft enable/disable toggle
- `preset_key`: Links rule to a preset definition for UI sync
- `created_at`: Timestamp

The `escalation_rule_targets` table maps rules to notification lists:
- `id`, `rule_id`, `list_id`

### API Endpoints
- `GET /api/escalation-rules?clubId=X` - Get all rules with targets for a club
- `POST /api/escalation-rules` - Create new rule (supports presetKey, metricThreshold, targetListIds)
- `PATCH /api/escalation-rules/:id` - Update rule (enable/disable, update threshold, etc.)
- `DELETE /api/escalation-rules/:id` - Delete rule

### UI Components
- `EscalationRulesModal`: Main modal with preset toggles and advanced section
- Uses React Query mutations with cache invalidation for real-time UI sync
- Sales threshold input with save button for metric presets
- Advanced section (hidden by default) shows custom rules

## Recent Changes

### December 10, 2025 - Notification List Roles
- Added `roleKey` field to notification_lists table for role-based categorization
- Role options: None, Core Team, Maintenance, Ownership, Kitchen Staff, Custom
- Added role selector dropdown in Notification Settings page for each list
- API GET/POST/PATCH endpoints updated to support roleKey field
- Automation presets now use custom list selection instead of fixed role mappings

### December 10, 2025 - Smart Automations Refactor
- Refactored escalation rules from complex rule builder to preset-based automation system
- Added preset toggles with on/off switches for common scenarios
- Implemented sales threshold configuration for metric-based presets
- Added "Advanced Automation" section hidden behind toggle for custom rules
- Fixed React Query cache invalidation for preset enable/disable flows
- Added useEffect for proper threshold hydration from existing rules
- Each automation preset has a "Notify:" dropdown to select any notification list
- Gaming Outage requires list selection before enabling (with warning message)

### December 10, 2025 - Notification Audit Trail
- Added `notification_logs` table to database for audit trail
- All notifications (real and simulated) are now recorded in the database
- Updated notification endpoint to save to database before sending

### December 10, 2025 - Notification UI Improvements
- Removed SMTP check for showing notification section - now always visible on existing logs
- Added simulation mode when SMTP not configured
- UI feedback shows "(simulated - SMTP not configured)" when simulating
- Fixed notification lists query to always fetch (not gated by SMTP status)

### December 10, 2025 - File Attachments Feature
- Added `log_attachments` table to database schema for storing file metadata
- Implemented StorageProvider abstraction (`server/storageProvider.ts`) for swappable storage backends
- ReplitObjectStorageProvider wraps ObjectStorageService for Replit's object storage
- Created ObjectUploader component using Uppy for frontend file uploads with presigned URLs
- Created FileAttachments component for displaying, uploading, and deleting attachments
- API endpoints:
  - `POST /api/attachments/upload-url` - Get presigned upload URL
  - `POST /api/attachments` - Save attachment metadata after upload
  - `GET /api/logs/:logId/attachments?clubId=X` - List attachments for a log
  - `DELETE /api/attachments/:id?clubId=X` - Delete attachment
  - `GET /objects/:objectPath(*)` - Serve uploaded files
- Dependencies added: @google-cloud/storage, @uppy/core, @uppy/aws-s3, @uppy/dashboard, @uppy/react

### December 9, 2025 - Notification List Integration
- Integrated with Social Club Pro's notification list architecture
- API endpoints for fetching notification lists and sending with list IDs
- UI updated to match Bootstrap pattern with radio buttons and multi-select
- Added reason selector and optional custom message fields
- Email template includes custom message section at top