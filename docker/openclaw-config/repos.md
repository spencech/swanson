# Upbeat Projects Repository Catalog

This document provides an overview of all 21 repositories in the TeachUpbeat organization available to Swanson.

For deeper per-repo context (key files, patterns, cross-repo dependencies, common modification patterns), read `/workspace/repos/<slug>/AGENTS.md` when it exists.

---

## Infrastructure & DevOps

### upbeat-aws-infrastructure
`https://github.com/TeachUpbeat/upbeat-aws-infrastructure.git`

Defines the global and regional AWS infrastructure necessary to run the Upbeat application environments. This includes CloudFormation templates for creating VPCs, RDS databases, Lambda functions, Cognito user pools, VPN endpoints, bastion hosts, and CodePipeline configurations. The repository contains scripts for creating, updating, and deleting regional stacks across dev, qa, staging, demo, and production environments.

### upbeat-cloudformation-json-stitcher
`https://github.com/TeachUpbeat/upbeat-cloudformation-json-stitcher.git`

A utility for stitching and merging CloudFormation JSON templates. Used to compose large infrastructure definitions from modular template fragments.

### upbeat-lambda-layers
`https://github.com/TeachUpbeat/upbeat-lambda-layers.git`

Shared AWS Lambda layers containing common runtime dependencies used across multiple Lambda functions in the Upbeat platform. Centralizes dependency management and reduces deployment package sizes.

---

## Web Applications

### upbeat-admin-portal
`https://github.com/TeachUpbeat/administrator-portal.git`

An Angular-based administrative portal for internal Upbeat operations. Provides Lambda backend functions and a web interface for launching products like survey admin, user admin, etc.

### upbeat-district-administration
`https://github.com/TeachUpbeat/district-administrator.git`

An Angular web application that enables district administrators to manage their district's engagement with the Upbeat platform. Includes Lambda backend functions for data retrieval and a frontend for viewing district-level analytics, managing schools, and configuring district settings.

### upbeat-reports
`https://github.com/TeachUpbeat/reports-2.0.git`

An Angular application for generating and viewing engagement survey reports. Provides data visualization components for heatmaps, engagement scores, frequency distributions, and PDF generation capabilities. Integrates with AWS Lambda for backend data retrieval and supports Google Slides export via the presentation generator.


### upbeat-survey-administration
`https://github.com/TeachUpbeat/upbeat-survey-administration.git`

An Angular web application for managing survey administrations, including configuring survey intervals, generating survey links, managing whitelabel settings, and monitoring survey completion status. Includes Lambda functions for backend operations.

### upbeat-survey-editor
`https://github.com/TeachUpbeat/survey-administrator.git`

An Angular application for creating and editing survey content. Allows administrators to design survey questions, configure response scales, set up translations (English/Spanish), organize questions into categories, and manage survey versions.

### upbeat-user-administration
`https://github.com/TeachUpbeat/user-administrator.git`

An Angular web application for managing Upbeat users across districts and schools. Provides functionality for user creation, role assignment, access management, and bulk user operations. Includes Lambda functions for user lifecycle management and Cognito integration.


---

## Backend Services

### upbeat-engagement-database
`https://github.com/TeachUpbeat/engagement-database.git`

Contains MySQL database schema definitions, stored procedures, and migration scripts for the engagement survey database. Includes SQL files for table structures, indexes, triggers, and data transformation routines that power the engagement analytics platform.

### upbeat-survey-legacy
`https://github.com/TeachUpbeat/survey.git`

The current production survey experience, authored in AngularJS and PHP. Front-end experience for users completing the Upbeat Survey.

### upbeat-datapacks
`https://github.com/TeachUpbeat/datapacks.git`

Data packaging and export utilities for the Upbeat platform. Handles bundling, formatting, and distribution of engagement data exports.

---

## Email & Notifications

### upbeat-sendgrid-cognito
`https://github.com/TeachUpbeat/upbeat-sendgrid-cognito.git`

Lambda function triggered by Amazon Cognito events to send transactional emails via SendGrid. Handles user lifecycle emails such as welcome messages, password resets, and account notifications.

### upbeat-sendgrid-mailer
`https://github.com/TeachUpbeat/lambda-sendgrid.git`

Core Lambda-based SendGrid mailer service. Provides a reusable email sending interface used by other Upbeat services for platform-wide email delivery.

### upbeat-sendgrid-webhook
`https://github.com/TeachUpbeat/upbeat-sendgrid-webhook.git`

Lambda function that receives and processes SendGrid event webhooks (delivery confirmations, bounces, opens, clicks). Stores email event data back into the platform.

### upbeat-sendgrid-websocket
`https://github.com/TeachUpbeat/upbeat-sendgrid-websocket.git`

Bridges SendGrid email events to WebSocket connections, enabling real-time email status updates in the Upbeat platform UI.

---

## Integrations & Utilities

### upbeat-pdf-generator
`https://github.com/TeachUpbeat/pdf-generator.git`

A Lambda function using Puppeteer/Chromium for generating PDF reports from HTML templates. Creates downloadable PDF versions of engagement reports, coaching summaries, and other platform outputs. Includes comprehensive test coverage via Jasmine.

### upbeat-presentation-generator
`https://github.com/TeachUpbeat/google-presentations.git`

A Lambda function that generates Google Slides presentations from teacher engagement data manifests. Creates automated presentations with district growth metrics, school comparisons, KPI tracking, participation rates, and coaching insights using the Google Slides and Sheets APIs.

---

## Tooling & Documentation

### upbeat-spawnee-plans
`https://github.com/TeachUpbeat/spawnee.git`

Repository of spawnee YAML task templates for orchestrating Cursor Cloud Agent work across the TeachUpbeat organization. Contains historical and active plans used to implement features across multiple repos.

### upbeat-documentation
`https://github.com/TeachUpbeat/upbeat-documentation.git`

Platform documentation and guides for the Upbeat system. Contains architecture docs, API references, onboarding guides, and operational runbooks.

---

## Knowledge Base

### swanson-db
`https://github.com/TeachUpbeat/swanson-db.git`

Curated AI knowledge base containing education research, database documentation, and CRM data. No application code — this repo exists purely to give agents grounded context about the Upbeat ecosystem.

**Contents:**

- **upbeat-research/** — 7 primary Upbeat research publications (teacher retention, engagement, working conditions, principal turnover, belonging & wellbeing) plus 261 cited secondary research articles. Includes a master citation compendium and a research-map linking publications to their citations.
- **upbeat-database/** — Complete MySQL 8.4 DDL schema dump (50+ tables) and a SQL query compendium cataloging ~546 queries across 11 repositories with function names, descriptions, and raw SQL.
- **upbeat-hubspot/** — HubSpot CRM export with 153 active customers and ~23,750 prospects. Each company has a markdown file with contacts, deals, industry, location, and revenue data. Includes pipeline stage breakdowns, account metrics, and a master index.

**When to search this repo:**
- Questions about Upbeat's research findings, citations, or education literature
- Database schema lookups (table structures, column definitions, relationships)
- SQL query discovery by function name, table, or behavior
- Customer or prospect lookups (contacts, deals, industry, location)
- Sales pipeline metrics and deal analysis

---

*Updated: February 2026*
