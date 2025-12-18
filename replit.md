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

### API Security (HMAC-SHA256 Signed Requests)
All API requests must be signed using HMAC-SHA256 with a shared secret. This prevents unauthorized access and replay attacks.

**Required Headers for all API calls:**
| Header | Description |
|--------|-------------|
| `X-Timestamp` | Unix timestamp (milliseconds) when request was made |
| `X-Signature` | HMAC-SHA256 signature of the request |
| `X-Club-Id` | The club identifier |

**Signature Generation (SCP Side):**
```javascript
const crypto = require('crypto');

// IMPORTANT: fullPath must include path AND query string 
// e.g., "/api/manager-logs?clubId=abc123&start=2025-01-01"
// This prevents query parameter tampering attacks.
function signRequest(method, fullPath, body, clubId, sharedSecret) {
  const timestamp = Date.now().toString();
  const payload = [
    method.toUpperCase(),
    fullPath,
    timestamp,
    clubId,
    body ? JSON.stringify(body) : ''
  ].join('\n');
  
  const signature = crypto
    .createHmac('sha256', sharedSecret)
    .update(payload)
    .digest('hex');
  
  return { timestamp, signature };
}
```

**Security Rules:**
- Requests older than 5 minutes are rejected (replay attack prevention)
- Invalid signatures return 401 Unauthorized
- The `MANAGER_LOG_SECRET` environment variable must match on both SCP and Manager Log
- In development mode without a secret, signature verification is bypassed with a warning

### SSO Embed Authentication
When embedding the Manager Log in SCP, users are authenticated via signed URL parameters.

**Embed URL Format:**
```
/embed?clubId=1&userId=5&userRole=manager&clubName=Eagle%20Lodge&firstName=John&lastName=Smith&membershipNumber=EL-1234&timestamp=1702756800000&signature=abc123...
```

**URL Parameters:**
| Parameter | Description |
|-----------|-------------|
| `clubId` | Club identifier |
| `userId` | User's ID in SCP |
| `userRole` | User's role (e.g., "manager", "admin") |
| `clubName` | Club display name (URL encoded) |
| `firstName` | User's first name |
| `lastName` | User's last name |
| `membershipNumber` | User's membership number |
| `timestamp` | Unix timestamp (milliseconds) |
| `signature` | HMAC-SHA256 signature |

**Embed Signature Generation (SCP Side):**
```javascript
const crypto = require('crypto');

function signEmbedUrl(params, sharedSecret) {
  const timestamp = Date.now().toString();
  const payload = [
    'EMBED',
    timestamp,
    params.clubId,
    params.userId,
    params.userRole,
    params.clubName,
    params.firstName,
    params.lastName,
    params.membershipNumber
  ].join('\n');
  
  const signature = crypto
    .createHmac('sha256', sharedSecret)
    .update(payload)
    .digest('hex');
  
  return { timestamp, signature };
}
```

### UI/UX Decisions
The UI features a dark header with a teal background, leveraging `shadcn/ui` components for a polished look consistent with Social Club Pro's branding. The Insights page includes interactive charts (line, bar, area) with customizable options (granularity, comparison, chart types, export) and collapsible sections.

### Feature Specifications
- **Daily Manager Logs**: Sales tracking (food, bar, gaming), weather, and operational notes. Past logs are read-only to prevent accidental modifications.
- **Running Maintenance List**: Standalone club-scoped maintenance tracking (separate from daily logs). Accessible via dedicated Maintenance tab. Features add/complete/reopen functionality. **Daily Reset Behavior**: Items use `resolvedAt` timestamp instead of permanent status changes. On any given day, the list shows all open items plus only items completed on that specific day (greyed out with strikethrough). Items completed on previous days are hidden but remain in the database. This creates a "daily reset" where tasks reappear each day until completed.
- **Weather Integration**: Displays current and historical weather data with year-over-year comparisons.
- **Insights & Analytics**: Summary cards, sales trend charts (daily, weekly, monthly granularity), period-over-period comparison, sales heatmap, sales by weekday, to-do status, sales breakdown pie charts, top performing days table, date range filtering, and export (CSV, PNG/PDF). Includes **Maintenance Insights** section showing open items count, completed items in date range, average days to complete, and a table of oldest open items with color-coded urgency badges.
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