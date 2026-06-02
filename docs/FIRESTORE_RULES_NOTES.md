# Firestore Security Rules – Notes for Phase 1

Add these rules to your Firebase Console (Firestore → Rules). Do not apply automatically.

## users

```
match /users/{userId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

## organizations

```
match /organizations/{orgId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update, delete: if request.auth != null && 
    get(/databases/$(database)/documents/organizations/$(orgId)).data.ownerUid == request.auth.uid;
  match /members/{memberId} {
    allow read: if request.auth != null;
    allow create: if request.auth != null;
    allow update, delete: if request.auth != null && 
      get(/databases/$(database)/documents/organizations/$(orgId)).data.ownerUid == request.auth.uid;
  }
}
```

## invites

```
match /invites/{inviteId} {
  allow read: if request.auth != null;
  allow create: if request.auth != null;
  allow update: if request.auth != null;
  allow delete: if request.auth != null && 
    resource.data.invitedByUid == request.auth.uid;
}
```

## organizations — slug lookup (tenant subdomains)

Query: `organizations` where `slug == {slug}` (limit 1).

Create single-field index on `slug` (Ascending) if Firebase Console prompts.

Slug fields are optional; existing org documents without `slug` are unchanged.

## projects (required for web dashboard & project list)

Without these rules, queries return **Missing or insufficient permissions**.

Deploy the rules file in the repo root: **`firestore.rules`** (Firebase Console → Firestore → Rules → paste, or `firebase deploy --only firestore:rules`).

Org owners must be allowed even when `organizations/{orgId}/members/{uid}` is missing (legacy data). The repo rules use `isOrgMember()` which checks **member doc OR `organizations.ownerUid`**.

```
match /projects/{projectId} {
  allow read: if request.auth != null && (
    resource.data.ownerId == request.auth.uid
    || (
      resource.data.orgId != null
      && (
        exists(/databases/$(database)/documents/organizations/$(resource.data.orgId)/members/$(request.auth.uid))
        || get(/databases/$(database)/documents/organizations/$(resource.data.orgId)).data.ownerUid == request.auth.uid
      )
    )
  );
  allow create: if request.auth != null;
  allow update, delete: if request.auth != null && (
    resource.data.ownerId == request.auth.uid
    || (
      resource.data.orgId != null
      && exists(/databases/$(database)/documents/organizations/$(resource.data.orgId)/members/$(request.auth.uid))
    )
  );

  match /tasks/{taskId} {
    allow read, write: if request.auth != null && (
      get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId == request.auth.uid
      || (
        get(/databases/$(database)/documents/projects/$(projectId)).data.orgId != null
        && exists(/databases/$(database)/documents/organizations/$(get(/databases/$(database)/documents/projects/$(projectId)).data.orgId)/members/$(request.auth.uid))
      )
    );
  }

  match /expenses/{expenseId} {
    allow read, write: if request.auth != null && (
      get(/databases/$(database)/documents/projects/$(projectId)).data.ownerId == request.auth.uid
      || (
        get(/databases/$(database)/documents/projects/$(projectId)).data.orgId != null
        && exists(/databases/$(database)/documents/organizations/$(get(/databases/$(database)/documents/projects/$(projectId)).data.orgId)/members/$(request.auth.uid))
      )
    );
  }
}
```

List queries must use the same filters as rules (`ownerId` or `orgId` + member access).

## Indexes

For `invites` collection query `where("token", "==", ...).where("status", "==", "pending")`:
- Create composite index: `token` (Ascending), `status` (Ascending)

For Projects (web) – Phase 2:

**Required composite indexes** (create in Firebase Console → Firestore → Indexes):

1. **projects** (personal):
   - Collection: `projects`
   - Fields: `ownerId` (Ascending), `updatedAt` (Descending)

2. **projects** (team):
   - Collection: `projects`
   - Fields: `orgId` (Ascending), `updatedAt` (Descending)

3. **tasks**:
   - Collection: `projects/{projectId}/tasks`
   - Fields: `createdAt` (Descending)

4. **expenses**:
   - Collection: `projects/{projectId}/expenses`
   - Fields: `date` (Descending) – usually auto-created

5. **invites** (for listOrgInvites):
   - Collection: `invites`
   - Fields: `orgId` (Ascending), `status` (Ascending)
