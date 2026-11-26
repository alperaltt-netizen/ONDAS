# Security Specification — Ondas Firestore Rules

## 1. Data Invariants
1. A user document at `/users/{userId}` can only be read, created, updated, or deleted by the verified owner (`request.auth.uid == userId && request.auth.token.email_verified == true`).
2. Every subcollection document (`/tracks/{trackId}`, `/playlists/{playlistId}`, `/transcriptions/{transcriptionId}`) requires the parent `/users/{userId}` document to exist on single-document operations (`exists(...)`) and requires `ownerId == request.auth.uid`.
3. All IDs (`userId`, `trackId`, `playlistId`, `transcriptionId`) must match `^[a-zA-Z0-9_\-]+$` and be `<= 128` chars.
4. All strings have explicit `.size()` bounds and arrays (`trackIds`) are bounded to `<= 500` entries.
5. `createdAt` and `ownerId`/`uid` are immutable after creation; `createdAt` and `updatedAt` must equal `request.time`.
6. No unauthenticated or cross-user `get`, `list`, `create`, `update`, or `delete` is permitted.

## 2. Dirty Dozen Adversarial Payloads (Expected: PERMISSION_DENIED)
1. Unauthenticated read on `/users/userA`.
2. Unverified email (`email_verified: false`) writing `/users/userA`.
3. Cross-user read on `/users/userB/tracks/track1` while signed in as `userA`.
4. Identity spoofing: `userA` creating `/users/userA/tracks/t1` with `ownerId: "userB"`.
5. Shadow field injection: creating `/users/userA/playlists/p1` with extra field `isAdmin: true`.
6. ID poisoning: creating `/users/userA/tracks/` with a 500-char ID or invalid characters (`../etc`).
7. Timestamp forgery: creating `/users/userA/transcriptions/tr1` with client-supplied `createdAt` != `request.time`.
8. Immutable field tampering: updating `ownerId` or `createdAt` on `/users/userA/tracks/t1`.
9. Oversized payload: writing `text` > 20,000 chars on `/users/userA/transcriptions/tr1`.
10. Unbounded array attack: writing `trackIds` with > 500 elements on `/users/userA/playlists/p1`.
11. Cross-user list query on `/users/userB/playlists` by `userA`.
12. Type poisoning: updating `currentTime` on `/users/userA/tracks/t1` with a string instead of a number.
