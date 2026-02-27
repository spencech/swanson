# Upbeat Projects Repository Catalog

This document provides an overview of all repositories eligible for Swanson in the TeachUpbeat repository.

---

## Infrastructure & DevOps

### upbeat-aws-infrastructure
`git@github.com:TeachUpbeat/upbeat-aws-infrastructure.git`

Defines the global and regional AWS infrastructure necessary to run the Upbeat application environments. This includes CloudFormation templates for creating VPCs, RDS databases, Lambda functions, Cognito user pools, VPN endpoints, bastion hosts, and CodePipeline configurations. The repository contains scripts for creating, updating, and deleting regional stacks across dev, qa, staging, demo, and production environments.

---

## Web Applications

### upbeat-admin-portal
`git@github.com:TeachUpbeat/administrator-portal.git`

An Angular-based administrative portal for internal Upbeat operations. Provides Lambda backend functions and a web interface for launching products like survey admin, user admin, etc.

### upbeat-district-administration
`git@github.com:TeachUpbeat/district-administrator.git`

An Angular web application that enables district administrators to manage their district's engagement with the Upbeat platform. Includes Lambda backend functions for data retrieval and a frontend for viewing district-level analytics, managing schools, and configuring district settings.

### upbeat-reports
`git@github.com:TeachUpbeat/reports-2.0.git`

An Angular application for generating and viewing engagement survey reports. Provides data visualization components for heatmaps, engagement scores, frequency distributions, and PDF generation capabilities. Integrates with AWS Lambda for backend data retrieval and supports Google Slides export via the presentation generator.


### upbeat-survey-administration
`git@github.com:TeachUpbeat/upbeat-survey-administration.git`

An Angular web application for managing survey administrations, including configuring survey intervals, generating survey links, managing whitelabel settings, and monitoring survey completion status. Includes Lambda functions for backend operations.

### upbeat-survey-editor
`git@github.com:TeachUpbeat/survey-administrator.git`

An Angular application for creating and editing survey content. Allows administrators to design survey questions, configure response scales, set up translations (English/Spanish), organize questions into categories, and manage survey versions.

### upbeat-user-administration
`git@github.com:TeachUpbeat/user-administrator.git`

An Angular web application for managing Upbeat users across districts and schools. Provides functionality for user creation, role assignment, access management, and bulk user operations. Includes Lambda functions for user lifecycle management and Cognito integration.


---

## Backend Services

### upbeat-engagement-database
`git@github.com:TeachUpbeat/engagement-database.git`

Contains MySQL database schema definitions, stored procedures, and migration scripts for the engagement survey database. Includes SQL files for table structures, indexes, triggers, and data transformation routines that power the engagement analytics platform.

### upbeat-survey-legacy
`git@github.com:TeachUpbeat/survey.git`

Actually still the currrent product survey, authored in angularjs and php. Front end experience for users completing the Upbeat Survey.



---

## Integrations & Utilities

### upbeat-pdf-generator
`git@github.com:TeachUpbeat/pdf-generator.git`

A Lambda function using Puppeteer/Chromium for generating PDF reports from HTML templates. Creates downloadable PDF versions of engagement reports, coaching summaries, and other platform outputs. Includes comprehensive test coverage via Jasmine.

### upbeat-presentation-generator
`https://github.com/TeachUpbeat/google-presentations.git`

A Lambda function that generates Google Slides presentations from teacher engagement data manifests. Creates automated presentations with district growth metrics, school comparisons, KPI tracking, participation rates, and coaching insights using the Google Slides and Sheets APIs.

---

## Analytics & Machine Learning


*Generated: January 20, 2026*
