---
name: Sales regression policy
description: Safety boundary and independent expectations for category-total regression tests
---

Keep the focused sales regression suite runnable offline without touching real
club records. Assert explicit expected amounts across each independently
calculated surface rather than using a production total calculator as the test
oracle.

**Why:** The regression risk is that one of several calculations omits a newer
category. Reusing that same calculation to produce expected values can hide the
omission. These checks must also remain safe to run in a workspace connected to
real club data.

**How to apply:** Preserve the isolated database boundary for fast sales checks.
Treat PostgreSQL integration testing as a separate suite requiring an explicitly
isolated database. When inspecting rendered HTML, distinguish a disabled
attribute from styling class names containing `disabled:`.