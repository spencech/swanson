// Repository names and labels for UI reference.
// Actual repo management is handled server-side by OpenClaw.

export const REPO_NAMES = [
  'upbeat-aws-infrastructure',
  'engagement-database',
  'administrator-portal',
  'district-administrator',
  'reports-2.0',
  'upbeat-survey-administration',
  'survey-administrator',
  'user-administrator',
  'survey',
  'pdf-generator',
  'google-presentations',
] as const

export const REPO_LABELS: Record<string, string> = {
  'upbeat-aws-infrastructure': 'AWS Infrastructure',
  'engagement-database': 'Engagement Database',
  'administrator-portal': 'Admin Portal',
  'district-administrator': 'District Administration',
  'reports-2.0': 'Reports',
  'upbeat-survey-administration': 'Survey Administration',
  'survey-administrator': 'Survey Editor',
  'user-administrator': 'User Administration',
  'survey': 'Survey (Legacy)',
  'pdf-generator': 'PDF Generator',
  'google-presentations': 'Presentation Generator',
}
