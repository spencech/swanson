// Repository names and labels for UI reference.
// Actual repo management is handled server-side by OpenClaw.

export const REPO_NAMES = [
  // Infrastructure & DevOps
  'upbeat-aws-infrastructure',
  'upbeat-cloudformation-json-stitcher',
  'upbeat-lambda-layers',
  // Web Applications
  'administrator-portal',
  'district-administrator',
  'reports-2.0',
  'upbeat-survey-administration',
  'survey-administrator',
  'user-administrator',
  // Backend Services
  'engagement-database',
  'survey',
  'datapacks',
  // Email & Notifications
  'upbeat-sendgrid-cognito',
  'lambda-sendgrid',
  'upbeat-sendgrid-webhook',
  'upbeat-sendgrid-websocket',
  // Utilities
  'pdf-generator',
  'google-presentations',
  // Tooling & Documentation
  'spawnee',
  'upbeat-documentation',
] as const

export const REPO_LABELS: Record<string, string> = {
  'upbeat-aws-infrastructure': 'AWS Infrastructure',
  'upbeat-cloudformation-json-stitcher': 'CloudFormation Stitcher',
  'upbeat-lambda-layers': 'Lambda Layers',
  'administrator-portal': 'Admin Portal',
  'district-administrator': 'District Administration',
  'reports-2.0': 'Reports',
  'upbeat-survey-administration': 'Survey Administration',
  'survey-administrator': 'Survey Editor',
  'user-administrator': 'User Administration',
  'engagement-database': 'Engagement Database',
  'survey': 'Survey (Legacy)',
  'datapacks': 'Datapacks',
  'upbeat-sendgrid-cognito': 'SendGrid Cognito',
  'lambda-sendgrid': 'SendGrid Mailer',
  'upbeat-sendgrid-webhook': 'SendGrid Webhook',
  'upbeat-sendgrid-websocket': 'SendGrid WebSocket',
  'pdf-generator': 'PDF Generator',
  'google-presentations': 'Presentation Generator',
  'spawnee': 'Spawnee Plans',
  'upbeat-documentation': 'Documentation',
}
