# Drawing App — Required API Endpoint

## Context

The Manager Log app fetches daily and weekly drawing numbers from the Drawing App to auto-fill the corresponding fields when a manager opens today's log. The proxy on the Manager Log side is fully built (`GET /api/drawing-numbers` in `server/routes.ts`). The Drawing App needs to expose one endpoint to make this live.

---

## Endpoint to Implement

```
GET /api/drawing-numbers?club=<clubName>&date=<yyyy-mm-dd>
Authorization: Bearer <DRAWING_APP_SECRET>
```

### Query Parameters

| Param  | Format       | Description                         |
|--------|------------- |-------------------------------------|
| `club` | string       | Club name, e.g. `"Eagle Lodge"`     |
| `date` | `yyyy-mm-dd` | The log date to look up numbers for |

### Authentication

Every request carries a Bearer token in the `Authorization` header. Verify it equals the `DRAWING_APP_SECRET` environment variable. Return `401` if it doesn't match or is missing.

### Response — success (HTTP 200)

```json
{
  "club": "Eagle Lodge",
  "daily": 42,
  "weekly": 156
}
```

**Important:** The `club` field in the response **must echo back the club name exactly as received** (case-insensitive match is fine, but return the original). The Manager Log proxy validates this field to guarantee it never pre-fills the wrong club's numbers.

| Field    | Type             | Description                                   |
|----------|------------------|-----------------------------------------------|
| `club`   | string           | Same club name from the query param (echoed)  |
| `daily`  | number \| null   | Today's daily drawing number, or `null`       |
| `weekly` | number \| null   | This week's weekly drawing number, or `null`  |

### Response — not found (HTTP 404)

Return `404` when no drawing numbers exist for the given club + date. The Manager Log proxy treats any non-200 as "not available" and leaves the inputs empty — no error is shown to the manager.

```json
{ "error": "No drawing numbers found for this club/date" }
```

### Response — bad request (HTTP 400)

Return `400` when `club` or `date` is missing/malformed.

---

## Security Checklist

- [ ] Verify `Authorization: Bearer <token>` on every request; return `401` on mismatch
- [ ] Only return numbers for the exact club requested — never return another club's data
- [ ] `DRAWING_APP_SECRET` must match the secret set in the Manager Log app

---

## Club Names

Club names come from the Manager Log database (`clubs.name`). Current clubs include names like `"Club 1"`, `"Club 2"`, etc. — whatever names are stored in the Manager Log's `clubs` table will be passed verbatim as the `club` query parameter.

---

## Shared Secret Setup

- **Manager Log app**: `DRAWING_APP_SECRET` is already set as a Replit Secret ✅
- **Drawing App**: Set the same value as `DRAWING_APP_SECRET` in the Drawing App's Replit Secrets

The Manager Log app's base URL for the Drawing App is set via `DRAWING_APP_URL` (currently `https://draw.socialclubpro.com`).
