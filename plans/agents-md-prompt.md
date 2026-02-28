# Prompt: Write AGENTS.md for a TeachUpbeat Repository

You are writing an `AGENTS.md` file for a TeachUpbeat repository. This file will be consumed by **Swanson**, an AI planning agent that:

1. **Answers questions** about the codebase and architecture
2. **Generates spawnee YAML plans** — structured task templates that dispatch Cursor Cloud Agents to implement features across multiple repos
3. **Provides context to executing agents** — Cursor Cloud Agents read AGENTS.md when working inside a repo

Your AGENTS.md must be **accurate, concrete, and grounded in the actual code**. Do not write generic framework documentation — search the repo and describe what actually exists.

---

## The Ecosystem

There are 21 repositories in the TeachUpbeat GitHub organization. Swanson has read-only access to all of them and uses ChunkHound (code search) to find patterns, files, and architecture across repos. The full catalog:

| GitHub Slug | Folder (Logical Name) | Default Branch | Category |
|---|---|---|---|
| `upbeat-aws-infrastructure` | upbeat-aws-infrastructure | develop | Infrastructure — CloudFormation, VPCs, RDS, Lambda, Cognito, CodePipeline |
| `upbeat-cloudformation-json-stitcher` | upbeat-cloudformation-json-stitcher | develop | Infrastructure — CloudFormation template stitching/merging utility |
| `upbeat-lambda-layers` | upbeat-lambda-layers | develop | Infrastructure — Shared Lambda layers (runtime dependencies) |
| `engagement-database` | upbeat-engagement-database | develop | Backend — MySQL schema, stored procedures, migrations |
| `administrator-portal` | upbeat-admin-portal | develop | Web App — Angular admin portal + Lambda backend |
| `district-administrator` | upbeat-district-administration | develop | Web App — Angular district admin + Lambda backend |
| `reports-2.0` | upbeat-reports | develop | Web App — Angular reports + Lambda backend |
| `upbeat-survey-administration` | upbeat-survey-administration | develop | Web App — Angular survey admin + Lambda backend |
| `survey-administrator` | upbeat-survey-editor | develop | Web App — Angular survey editor + Lambda backend |
| `user-administrator` | upbeat-user-administration | develop | Web App — Angular user admin + Lambda backend |
| `survey` | upbeat-survey-legacy | develop | Backend — AngularJS + PHP survey front end |
| `datapacks` | upbeat-datapacks | develop | Backend — Data packaging/export utilities |
| `pdf-generator` | upbeat-pdf-generator | develop | Utility — Lambda + Puppeteer PDF generation |
| `google-presentations` | upbeat-presentation-generator | develop | Utility — Lambda + Google Slides API |
| `upbeat-sendgrid-cognito` | upbeat-sendgrid-cognito | develop | Email — Cognito-triggered email via SendGrid |
| `lambda-sendgrid` | upbeat-sendgrid-mailer | develop | Email — Lambda SendGrid mailer |
| `upbeat-sendgrid-webhook` | upbeat-sendgrid-webhook | develop | Email — SendGrid webhook receiver/processor |
| `upbeat-sendgrid-websocket` | upbeat-sendgrid-websocket | develop | Email — SendGrid real-time WebSocket events |
| `spawnee` | upbeat-spawnee-plans | develop | Tooling — Spawnee task plan templates and orchestration configs |
| `upbeat-documentation` | upbeat-documentation | develop | Documentation — Platform documentation and guides |
| `swanson-db` | swanson-db | develop | Knowledge Base — Research publications, HubSpot CRM data, database schema/SQL catalog |

### How Swanson Uses the `repository` Field

When Swanson generates a plan step, the `repository` field becomes the URL suffix:
```
https://github.com/TeachUpbeat/<repository>.git
```

So the AGENTS.md for `reports-2.0` must state that the GitHub slug is `reports-2.0`, not `upbeat-reports` (the logical name). **Always include the exact GitHub slug prominently.**

---

## Global Coding Conventions

All TeachUpbeat repos follow these conventions (don't repeat them verbatim in AGENTS.md — only mention repo-specific deviations):

- **TypeScript** with `strict: true` (except legacy code)
- **ES Modules** — `.mts` source → `.mjs` output. No CommonJS.
- **Node.js 20.x** for Lambda functions
- **npm** as package manager
- **Tabs** for indentation, **double quotes**, **semicolons**
- **Naming**: `camelCase` vars/functions, `PascalCase` classes, `I`-prefixed interfaces, `PascalCase` enum members with string values, `SCREAMING_SNAKE_CASE` constants, `_underscore` private members
- **No ORM** — raw SQL with parameterized queries (mysql2)
- **No CSS-in-JS or Tailwind** — LESS with organized variables/mixins
- **No Redux/NgRx** — RxJS `BehaviorSubject` for state
- **Testing**: Jasmine (backend), Karma/Jasmine (frontend), Cypress (E2E)
- **Angular 19** with `standalone: false`
- **Backend routes**: Extend `AbstractRoute` with `get()`/`post()`/`put()`/`delete()` mapped to HTTP verbs
- **Shared libraries**: `ems-node-app-utils` (trace, clone, empty), `ems-aws-local-utilities` (AWS credentials, SSM, S3), `ems-web-app-*` (Angular UI components)

---

## AGENTS.md Template

Write the file using exactly this structure. Every section is required unless marked optional. Be specific — cite actual file paths, actual class names, actual stored procedure names.

```markdown
# <Repo UI Label> — AGENTS.md

> **GitHub slug:** `<exact-github-slug>`
> **Category:** <Infrastructure | Web App | Backend | Utility>
> **URL:** `https://github.com/TeachUpbeat/<slug>.git`

## Purpose

<2-3 sentences: What this repo does, who uses it, and why it exists. Be specific to the Upbeat product, not generic.>

## Tech Stack

| Layer | Technology |
|---|---|
| Language | <e.g., TypeScript (strict), PHP 8, AngularJS 1.x> |
| Framework | <e.g., Angular 19, Express, raw Lambda handler> |
| Build | <e.g., ng build, tsc, webpack, SAM> |
| Test | <e.g., Karma/Jasmine, Jasmine standalone, Cypress> |
| Styling | <e.g., LESS, none> |
| Deploy | <e.g., CodePipeline → S3/CloudFront, CodePipeline → Lambda, manual> |

## Directory Structure

<Show the actual top-level directory tree (2-3 levels deep). Annotate key directories.>

```
├── src/
│   ├── app/              # Angular modules and components
│   ├── routes/           # Lambda route handlers (extend AbstractRoute)
│   └── environments/     # Angular environment configs
├── lambda/               # Lambda entry point and handler
├── cypress/              # E2E tests
├── buildspec.yml         # CodePipeline build spec
└── package.json          # Scripts, config.accounts
```

## Architecture

### Entry Points

<List the actual entry points an agent would need to know: Lambda handler, Angular bootstrap, main module, router config. Include file paths.>

### Key Patterns

<Describe the 3-5 most important architectural patterns in this repo. For each, name the pattern, cite the base class/service/file, and explain how new code should follow it. Example:>

- **Route pattern**: All API routes extend `AbstractRoute` (`src/routes/AbstractRoute.mts`). New routes implement `get()`, `post()`, etc. The controller (`src/routes/Controller.mts`) dispatches based on `httpMethod + resource`.
- **State management**: Services expose `BehaviorSubject` via `.asObservable()`. Components subscribe in `ngOnInit` and unsubscribe in `ngOnDestroy`.

### Data Flow

<Describe the primary data flow: How does a request enter, get processed, and return? For web apps: HTTP → Lambda → route → SQL → response. For utilities: trigger → input → processing → output. Be specific about actual function names and files.>

## Key Files

<List the 10-15 most important files an agent would need to read or modify when working in this repo. Group by purpose. Include brief descriptions.>

### Configuration
- `package.json` — Scripts, `config.accounts` (environment URLs, AWS profiles, Cognito pool IDs)
- `buildspec.yml` — CodePipeline build specification
- <others>

### Backend (Lambda)
- `lambda/index.mts` — Lambda entry point
- `src/routes/Controller.mts` — Route dispatcher
- `src/routes/AbstractRoute.mts` — Base route class
- <list the actual route files>

### Frontend (Angular)
- `src/app/app.module.ts` — Root module
- `src/app/app-routing.module.ts` — Route definitions
- <list the key components/services>

### Tests
- <list test directories and key test files>

## Cross-Repo Dependencies

<This is critical for plan generation. List every dependency this repo has on other TeachUpbeat repos, and every repo that depends on this one. Be specific about what the dependency is.>

### This repo depends on:
- **`engagement-database`** — All SQL queries target tables/procedures defined there. Key procedures used: `<list actual procedure names>`.
- **`upbeat-aws-infrastructure`** — Lambda function, Cognito pool, API Gateway, and CloudFront distribution are defined in `<specific CloudFormation template file>`.

### Other repos depend on this:
- **`reports-2.0`** — Calls this repo's API endpoints for `<specific data>`.

## Common Modification Patterns

<Describe the most common types of changes an agent would make in this repo, and what files are typically involved. This directly helps Swanson generate accurate plan steps.>

### Adding a new API endpoint
1. Create a new route class in `src/routes/` extending `AbstractRoute`
2. Register the route in `src/routes/Controller.mts`
3. Add any new SQL queries (parameterized, using mysql2)
4. If a new Lambda function is needed: update `upbeat-aws-infrastructure` (CloudFormation)
5. Add tests in `src/routes/__tests__/`

### Adding a new Angular page/component
1. Generate component in `src/app/<module>/`
2. Add route in `src/app/app-routing.module.ts`
3. Register in the parent module's `declarations` array
4. Add LESS styles in the component directory
5. Add Cypress E2E test in `cypress/e2e/`

### Modifying database schema
1. This repo does NOT own the schema — create a migration in `engagement-database`
2. Update stored procedures in `engagement-database` if needed
3. Update SQL queries in this repo's route files to match

## Environment & Deployment

<Describe how to run locally, how CI/CD works, and any environment-specific details.>

- **Local dev**: `npm start` → `<what happens>`
- **Environments**: dev, qa, staging, demo, production (configured in `package.json` → `config.accounts`)
- **Deploy**: CodePipeline watches `<branch>`, runs `buildspec.yml`, deploys to `<target>`
- **Environment selection**: Scripts use `--stage` and `--profile` flags

## Conventions Specific to This Repo

<Only list conventions that DIFFER from the global conventions above. If this repo follows all global conventions exactly, write "Follows all global conventions — no repo-specific overrides." Do NOT repeat the global conventions.>

## Gotchas & Warnings

<List 3-5 things that would trip up an agent unfamiliar with this repo. Examples:>

- The `survey` repo slug maps to the logical name `upbeat-survey-legacy` in the Swanson UI — don't confuse it with `survey-administrator` (Survey Editor)
- The stored procedure `sp_get_district_data` returns different columns depending on the `@report_type` parameter — always check the procedure definition in `engagement-database`
- Angular components are NOT standalone — do not add `standalone: true`
```

---

## Instructions for the Writing Agent

1. **Search before writing.** For every section, actually search the repository's files. Use `find`, `grep`, `cat`, or whatever tools you have. Never guess at file paths, class names, or patterns.

2. **Be specific.** Instead of "the main service file", write `src/app/services/DistrictService.ts`. Instead of "stored procedures", write `sp_get_district_schools`, `sp_get_district_analytics`.

3. **Cross-repo dependencies are the highest-value section.** Swanson uses these to determine which repos a plan step needs. If you get these wrong, the generated spawnee YAML will be incomplete. Trace actual imports, SQL queries, and API calls to identify real dependencies.

4. **The GitHub slug must be exact.** The slug is derived from the GitHub URL (the repo name portion of `https://github.com/TeachUpbeat/<slug>.git`). Use it everywhere. The complete mapping is:

   | GitHub Slug | Folder / Logical Name |
   |---|---|
   | `upbeat-aws-infrastructure` | upbeat-aws-infrastructure |
   | `upbeat-cloudformation-json-stitcher` | upbeat-cloudformation-json-stitcher |
   | `upbeat-lambda-layers` | upbeat-lambda-layers |
   | `engagement-database` | upbeat-engagement-database |
   | `administrator-portal` | upbeat-admin-portal |
   | `district-administrator` | upbeat-district-administration |
   | `reports-2.0` | upbeat-reports |
   | `upbeat-survey-administration` | upbeat-survey-administration |
   | `survey-administrator` | upbeat-survey-editor |
   | `user-administrator` | upbeat-user-administration |
   | `survey` | upbeat-survey-legacy |
   | `datapacks` | upbeat-datapacks |
   | `pdf-generator` | upbeat-pdf-generator |
   | `google-presentations` | upbeat-presentation-generator |
   | `upbeat-sendgrid-cognito` | upbeat-sendgrid-cognito |
   | `lambda-sendgrid` | upbeat-sendgrid-mailer |
   | `upbeat-sendgrid-webhook` | upbeat-sendgrid-webhook |
   | `upbeat-sendgrid-websocket` | upbeat-sendgrid-websocket |
   | `spawnee` | upbeat-spawnee-plans |
   | `upbeat-documentation` | upbeat-documentation |
   | `swanson-db` | swanson-db |

5. **Keep it under 300 lines.** AGENTS.md is read by AI agents in context windows — bloat degrades performance. Be dense, not verbose. Prefer tables and lists over paragraphs.

6. **Don't repeat global conventions.** The global coding conventions (listed above) are already known to Swanson. Only mention what's different in this specific repo.

7. **Test your cross-repo claims.** If you say "this repo calls the PDF generator API", verify that there's actually an HTTP call or Lambda invocation to `pdf-generator` in the code. If you say "requires a CloudFormation update in upbeat-aws-infrastructure", identify the specific template file.

8. **Write for an agent, not a human.** Optimize for an AI agent that needs to:
   - Decide which repos a feature touches
   - Identify which files to modify for a given change
   - Write correct spawnee task prompts with accurate file paths and patterns
   - Understand dependencies between plan steps across repos

---

## Execution

Write one `AGENTS.md` per repo. Place it at the repository root (`/AGENTS.md`). Process all 21 repos:

**Infrastructure & DevOps:**
1. `upbeat-aws-infrastructure`
2. `upbeat-cloudformation-json-stitcher`
3. `upbeat-lambda-layers`

**Web Applications:**
4. `administrator-portal`
5. `district-administrator`
6. `reports-2.0`
7. `upbeat-survey-administration`
8. `survey-administrator`
9. `user-administrator`

**Backend Services:**
10. `engagement-database`
11. `survey`
12. `datapacks`

**Email & Notifications:**
13. `upbeat-sendgrid-cognito`
14. `lambda-sendgrid`
15. `upbeat-sendgrid-webhook`
16. `upbeat-sendgrid-websocket`

**Utilities:**
17. `pdf-generator`
18. `google-presentations`

**Tooling & Documentation:**
19. `spawnee`
20. `upbeat-documentation`

**Knowledge Base:**
21. `swanson-db`

For each repo, read the actual code before writing. Do not copy-paste between repos — each AGENTS.md should reflect that repo's actual structure, patterns, and files.

**Note on `spawnee` and `upbeat-documentation`:** These repos may not follow the standard Lambda/Angular patterns. Adapt the template — skip sections that don't apply (e.g., "Adding a new API endpoint" for a documentation repo) and add sections that are relevant (e.g., "Template structure" for the spawnee plans repo).

If an AGENTS.md file, append to it, do not replace its contents.