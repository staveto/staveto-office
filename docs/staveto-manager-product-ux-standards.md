# Staveto Manager — Product & UX Standards

Permanent product and UX rules for **Staveto Manager Web App** (`staveto-office`). Apply to onboarding, all manager modules, and future features.

---

## Main principle

Build according to modern **SaaS**, **PWA**, **accessibility**, and **construction management** UX standards.

**Every feature must be useful, simple, fast, and understandable** for a construction company owner, manager, accountant, or worker.

- Do **not** build features only because they are technically possible.
- Build features that **help the user every day**.

---

## UX standards

- The app must feel **simple**, not overloaded.
- Every screen must have a **clear purpose**.
- Every **primary action** must be obvious.
- Forms must be **short** and split into **logical steps**.
- Users should **never wonder what to do next**.
- Use **progressive disclosure**: simple options first, advanced later.
- Use **contextual help** instead of long tutorials.
- **Avoid long onboarding explanations.**
- Give users **value as early as possible**.
- Use **empty states** that explain what to do next.
- Use **loading**, **error**, and **success** states everywhere.
- **Slovak copy first**, English as secondary (`src/i18n/translations.ts`).
- Avoid **technical language** in UI.
- Use **friendly but professional** wording.

---

## Accessibility (WCAG 2.2 where possible)

- All buttons and inputs must have **accessible labels** (`htmlFor` / `aria-label`).
- **Keyboard navigation** must work.
- **Focus states** must be visible.
- **Text contrast** must be strong enough.
- **Error messages** clear and **next to the related input**.
- Forms must **not rely only on color** for errors.
- **Touch targets** large enough for mobile/tablet.
- Do not use **tiny text** for important information.

---

## PWA / responsive

- Work well on **desktop**, **tablet**, and **mobile**.
- **Desktop** — managers and office work.
- **Mobile / PWA** — field use and quick actions.
- Layouts must be **responsive**, not squeezed desktop layouts.
- Important actions **reachable quickly**.
- Avoid **desktop-only** interactions without a mobile alternative.

---

## Construction management product priorities

Prioritize what construction companies use **daily**:

| Area | Examples |
|------|----------|
| Work | projects/jobs, planning/calendar, tasks |
| People | employees/team, attendance |
| Site | documents/photos, issues/problem reporting |
| Money | quotes, invoices, expenses, reports |
| External | customer communication |

### Manager value (30-second test)

When a manager opens Staveto, they should quickly see:

- what is happening **today**
- which **projects** are active
- **who** is assigned where
- what is **delayed**
- what needs **approval**
- which **quotes** need action
- which **invoices** or **expenses** need attention
- what **problems** were reported from sites

---

## Onboarding standards

Onboarding must **not** feel like generic SaaS. It must feel like **Staveto** and align with the **mobile app principle**.

### Flow (6 steps)

1. Welcome the user  
2. Clean **personal profile** (`firstName`, `lastName`, optional role)  
3. **Personal vs company** usage  
4. Optionally **create** or **join** a company (keep existing `/join?token=` flow)  
5. Optional **feature interests**  
6. Guide to the **correct workspace** → `/app`

### Data collection rules

| Field | Rule |
|-------|------|
| `firstName`, `lastName` | **Required** |
| Usage type (`personal` \| `company`) | **Required** |
| `companyName` | **Required** only when **creating** a company |
| Feature interests | **Optional** |
| `phoneNumber`, `country`, `companySize`, `companyType` | **Do not add** unless present in verified mobile model or explicitly approved |

### UX rules for onboarding

- Do **not** ask for too much up front.
- Do **not** block with unnecessary fields.
- Collect only what is needed for a **useful first experience**.
- Short steps, obvious next action, SK-first copy.
- Implementation: `src/services/onboarding/`, `src/app/(app)/onboarding/`.

---

## Features to favor over time

- Smart dashboard  
- Quick actions  
- Clear empty states  
- Project activity feed  
- Contextual tips  
- Recently used projects  
- Saved quote templates  
- Simple PDF export  
- Calendar drag-and-drop planning (when in scope)  
- Mobile-friendly upload/photo flow  
- AI that **prepares drafts**, not risky auto-actions  
- **Confirmation** before sending emails, invoices, or changing schedules  

---

## AI agent UX rule

The AI assistant is a **safe manager assistant**, not a random chatbot.

It may: summarize, suggest, prepare drafts, find problems, help create quotes/invoices.

**Sensitive actions require explicit user confirmation:**

- sending emails  
- creating **final** invoices  
- changing schedules  
- deleting data  
- inviting users  
- changing permissions  
- exporting or sharing documents  

---

## Design identity (Staveto)

- Dark navy background (`#1D376A`)  
- Orange primary actions (`#e06737`)  
- Clean white / light gray cards  
- Strong typography, rounded cards, simple icons  
- Professional **B2B construction** feel  

---

## Checklist before any new screen

1. Define the **user goal**  
2. Define the **primary action**  
3. Define the **empty state**  
4. Define **loading** and **error** states  
5. Check **accessibility**  
6. Check **mobile** responsiveness  
7. Avoid **unnecessary fields**  
8. Avoid **fake/mock data** unless clearly marked as placeholder  

---

## Related docs

- `docs/staveto-web-onboarding-proposal.md`  
- `docs/staveto-manager-architecture.md`  
- `docs/staveto-manager-feature-inventory.md`  
