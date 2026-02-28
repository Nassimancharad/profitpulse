# RBAC Test Matrix

## Covered (automated)
- Role fallback behavior in auth helpers (`VIEWER` fail-closed default)
- Cookie-role revalidation decision logic:
  - DB role overrides stale cookie role
  - shops missing from DB memberships are dropped
  - DB-unavailable path downgrades to `VIEWER`
- Cookie policy and embedded context parsing

## Not yet covered (high priority)
- Route-level integration checks for admin-only endpoints (`/api/sync`, `/api/costs`, `/api/expenses`, `/api/auth/*disconnect`)
- `/api/users` demotion concurrency with two simultaneous requests and row-lock behavior
- End-to-end role change propagation from `/api/users` to subsequent cookie-auth API request

## Manual checks
1. Demote admin to viewer and confirm old cookie cannot write.
2. Promote viewer to admin and confirm write endpoints return success.
3. Attempt to demote last admin and confirm request is rejected.
4. Attempt two admin demotions in parallel and confirm at least one admin remains.
