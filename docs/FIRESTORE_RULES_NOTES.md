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
