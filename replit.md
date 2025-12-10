# Restaurant Manager's Log

## Overview
A restaurant management application designed as an embeddable module for Social Club Pro. Its core purpose is to provide restaurant managers with tools for daily operational tracking, including logging daily sales (food, bar, gaming), monitoring weather with year-over-year comparisons, maintaining operational notes, and managing maintenance items. The system also offers advanced analytics for sales trends, to-do status, and performance comparisons, all while integrating seamlessly with Social Club Pro's visual identity. The application supports multi-club deployment with `clubId`-based data isolation.

## User Preferences
Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend
A React 18 SPA built with Vite, using `shadcn/ui` (Radix UI) and Tailwind CSS for styling, adhering to the Social Club Pro teal theme (`hsl(174, 83.9%, 31.6%)`) and Inter font. State management is handled by TanStack Query for server state and React Context (`ManagerLogContext`) for module configuration. Form handling uses React Hook Form with Zod validation.

### Backend
An Express.js REST API developed with Node.js and TypeScript. It features modular routing, custom error handling, and request/response logging. Drizzle ORM is used for type-safe database operations with Neon Serverless PostgreSQL, following a schema-first approach. Data models include Manager Logs and Maintenance Items, both `clubId`-scoped. A Repository pattern abstracts database interactions.

### Multi-Club Architecture
Designed as an embeddable module, data isolation is managed via a `clubId` column in the database and filtered API endpoints. The `ManagerLogModule` React component provides `clubId` and `apiBaseUrl` via `ManagerLogContext` for proper scoping of all operations.

### UI/UX Decisions
The UI features a dark header with a teal background, leveraging `shadcn/ui` components for a polished look consistent with Social Club Pro's branding. The Insights page includes interactive charts (line, bar, area) with customizable options (granularity, comparison, chart types, export) and collapsible sections.

### Feature Specifications
- **Daily Manager Logs**: Sales tracking (food, bar, gaming), weather, and operational notes.
- **Maintenance Tracking**: Manage to-do items linked to logs, with status and date filters. Includes rollover functionality for open items and file attachments.
- **Weather Integration**: Displays current and historical weather data with year-over-year comparisons.
- **Insights & Analytics**: Summary cards, sales trend charts (daily, weekly, monthly granularity), period-over-period comparison, sales heatmap, sales by weekday, to-do status, sales breakdown pie charts, top performing days table, date range filtering, and export (CSV, PNG/PDF).
- **Email Notifications**: Managers can send professional HTML emails with log summaries to specified recipients.
- **Escalation Rules / Smart Automations**: Allows configuration of automated notifications based on triggers using preset-based models (e.g., Maintenance Alerts, Sales Drop Warning).
- **Tomorrow's Prep Checklist**: Manages daily prep tasks with rollover tracking and status updates.

## External Dependencies

### Weather Data
- **Open-Meteo API**: Fetches current and historical weather data.

### Database
- **Neon Serverless PostgreSQL**: Cloud-hosted relational database.

### Third-Party Libraries
- **Radix UI**: Accessible component primitives for `shadcn/ui`.
- **date-fns**: Date manipulation.
- **Zod**: Runtime schema validation.
- **nanoid**: Unique ID generation.
- **class-variance-authority & clsx**: Conditional CSS class names.
- **TanStack Query**: Server state management.
- **React Hook Form**: Form management.
- **html2canvas & jsPDF**: Client-side chart export.
- **multer**: Handles multipart form data for file uploads.
- **nodemailer**: SMTP email sending.