# TCG Format Assist

Upload a drafted report (.docx started from the TCG report template) and download it formatted to TCG report standards: heading, text and list styles, table shading and indents, and removal of manual overrides and stray empty lines. The wording is never changed.

## How it works

1. The browser uploads the file straight to S3 using a presigned URL. Vercel can't accept request bodies over 4.5 MB.
2. `POST /api/jobs` runs `lib/formatter`:
   - **Regions** (`extract.ts`): the cover, table of contents, signature block and appendices are left untouched. Only the report body and Limitations are formatted.
   - **Classification** (`classify.ts`): Claude labels each paragraph (H1–H5, body, bullet, numbered, caption, closing) and each table (data, photo, keep). If Claude fails, rule-based `roles.ts` is used instead and the job shows a warning.
   - **Styles** (`numbering.ts`, `styles-sync.ts`): the template's style definitions and heading/bullet lists are copied into the document from `templates/tcg-report-template.docx`.
   - **Rules** (`apply.ts`): formatting is applied deterministically. Body text gets `Text{n}` for the heading level above it. Bullets go on the TCG list, indented to their section. Tables get the TCG header and row shading and the section indent.
   - **Verification** (`verify.ts`): all text, tracked changes, comments, images and tables are compared before and after. If anything differs, the job fails and nothing is saved.
3. The formatted file is stored in S3 and downloaded through a presigned link.

All TCG constants (indents, colours, table sizes) live in `lib/formatter/standards.ts`.

## Accounts

Auth is the same as meetagent, but uses its own `formatassist` database:
- There is no self sign-up.
- A super admin creates users under **Users** and shares the one-time password shown there.
- Each user sets their own password at first sign-in.

Roles:

| Role | Can do |
|---|---|
| `user` | Format reports; see their own history. |
| `admin` | Also sees everyone's history and AI usage. |
| `super_admin` | Also manages users and chooses the Claude model. |

## Local development

```bash
cp .env.example .env.local   # fill in values
npm install
npm run seed                 # creates the first super admin from SUPERADMIN_*
npm run dev
```

Other commands:
- `npm test`: engine unit tests.
- `npm run format -- "samples/Report.docx" [--claude]`: format a file from the command line. It writes `<name> - Formatted.docx` next to the input.

## Deploying to Vercel

1. Set every variable from `.env.example` in Vercel → Project → Settings → Environment Variables. Use a new `AUTH_SECRET`.
2. MongoDB Atlas → Network Access must allow Vercel (0.0.0.0/0). Run `npm run seed` once against the production database.
3. The S3 bucket's CORS configuration must allow `PUT` and `GET` from the app's Vercel domain (and `http://localhost:3000` for local dev). Without this, browser uploads fail.
4. Recommended: add an S3 lifecycle rule that expires objects under `formatassist/` after 30 days.
5. `/api/jobs` runs for up to 300 s (`maxDuration`). This needs a Vercel Pro plan, as proposalagent already uses.
