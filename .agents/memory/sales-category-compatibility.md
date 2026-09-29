---
name: Sales category compatibility
description: How to treat omitted sales categories when older clients and historical imports coexist with newer categories
---

When adding a new sales category, distinguish an **omitted** category from an explicit zero or clear. Older import formats and partial budget updates must preserve the existing value of omitted categories. Recompute totals from the resulting combined category values, not just the fields in the latest request.

**Why:** Existing three-category CSV imports and clients can still be used after new categories are introduced. Interpreting an omitted field as zero silently erases newer sales data or makes totals disagree with the breakdown.

**How to apply:** For future sales categories, keep import columns optional for compatibility; let an explicitly supplied value replace the saved amount, while an absent key leaves it unchanged. Ensure partial updates only write supplied fields.