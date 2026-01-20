import { BrowserWindow, shell } from 'electron'
import http from 'http'
import crypto from 'crypto'
import { URL } from 'url'
import { setAuth, clearAuth, getAuth } from './store'

const CALLBACK_PORT = 4200
const CALLBACK_PATH = '/sso/index.html'

// Google OAuth configuration
const GOOGLE_CLIENT_ID = '776631454856-nbpd33ph7gpeeve0p1m80ibi2s5bmlj7.apps.googleusercontent.com'
const GOOGLE_REDIRECT_URI = 'https://dev.api.reports.teachupbeat.net/auth/google/callback'

/**
 * Generate the Google OAuth URL with fresh state/nonce
 */
function generateSsoUrl(): string {
  const nonce = crypto.randomUUID().replace(/-/g, '')
  const state = Buffer.from(JSON.stringify({
    nonce,
    redirect: `http://localhost:${CALLBACK_PORT}`,
    timestamp: Date.now()
  })).toString('base64')

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'email openid profile',
    access_type: 'offline',
    prompt: 'select_account',
    state
  })

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
}

let authServer: http.Server | null = null

interface AuthTokens {
  accessToken: string
  refreshToken?: string
  user?: {
    email: string
    name: string
  }
}

/**
 * Try to decode a JWT token to extract user info
 * Handles Cognito ID tokens which have email in the payload
 */
function decodeJwtPayload(token: string): { email?: string; name?: string; sub?: string } | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null

    // Decode the payload (second part) - handle URL-safe base64
    let payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    // Pad if needed
    while (payload.length % 4) {
      payload += '='
    }
    const decoded = Buffer.from(payload, 'base64').toString('utf-8')
    const data = JSON.parse(decoded)

    // Cognito ID tokens typically have: email, name, given_name, family_name, cognito:username
    // Cognito access tokens have: sub, username, cognito:groups

    // Get raw email and strip google_ prefix if present (Cognito SSO convention)
    let rawEmail = data.email ||
                   (data['cognito:username']?.includes('@') ? data['cognito:username'] : null) ||
                   data.preferred_username
    if (rawEmail) {
      rawEmail = rawEmail.replace(/^google_/, '')
    }

    return {
      email: rawEmail,
      // For name, use full name (given_name + family_name) for header display
      name: (data.given_name && data.family_name)
            ? `${data.given_name} ${data.family_name}`
            : data.given_name || data.nickname || data.name || null,
      sub: data.sub,
    }
  } catch (e) {
    console.error('Failed to decode JWT:', e)
    return null
  }
}

/**
 * Start local HTTP server to receive SSO callback
 */
export function startAuthServer(): Promise<AuthTokens> {
  return new Promise((resolve, reject) => {
    // Close existing server if any
    if (authServer) {
      authServer.close()
    }

    authServer = http.createServer((req, res) => {
      const url = new URL(req.url || '', `http://localhost:${CALLBACK_PORT}`)

      // Check if this is the SSO callback
      if (url.pathname === CALLBACK_PATH || url.pathname === '/sso/' || url.pathname === '/') {
        // Get both tokens - id_token typically has user info, access_token for API calls
        const idToken = url.searchParams.get('id_token')
        const accessToken = url.searchParams.get('access_token') ||
                          url.searchParams.get('token') ||
                          idToken // fallback to id_token if no access_token
        const refreshToken = url.searchParams.get('refresh_token') ||
                            url.searchParams.get('refresh')

        // Try to get user info from params first
        let email = url.searchParams.get('email') || url.searchParams.get('user_email')
        let name = url.searchParams.get('name') || url.searchParams.get('user_name') || url.searchParams.get('display_name')

        // If no email in params, try to decode from id_token first (has user claims), then access_token
        if (!email) {
          // Try id_token first - it typically has email and name claims
          if (idToken) {
            const idTokenData = decodeJwtPayload(idToken)
            if (idTokenData) {
              email = idTokenData.email || null
              name = name || idTokenData.name || null
            }
          }
          // If still no email, try access_token
          if (!email && accessToken && accessToken !== idToken) {
            const accessTokenData = decodeJwtPayload(accessToken)
            if (accessTokenData) {
              email = accessTokenData.email || null
              name = name || accessTokenData.name || null
            }
          }
        }

        if (accessToken) {
          const tokens: AuthTokens = {
            accessToken,
            refreshToken: refreshToken || undefined,
            user: email ? { email, name: name || email } : undefined,
          }

          // Store tokens
          setAuth({
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            user: tokens.user,
          })

          // Send success response to browser with proper UTF-8 encoding
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Authentication Successful</title>
<style>
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
  background: #f9fafb;
}
.container {
  text-align: center;
  padding: 2rem;
}
.success {
  color: #059669;
  font-size: 1.5rem;
  margin-bottom: 1rem;
}
.message {
  color: #6b7280;
}
</style>
</head>
<body>
<div class="container">
  <div class="success">&#10003; Authentication Successful</div>
  <p class="message">You can close this window and return to Swanson.</p>
</div>
<script>
setTimeout(function() { window.close(); }, 2000);
</script>
</body>
</html>`)

          // Close server and resolve
          stopAuthServer()
          resolve(tokens)
        } else {
          // No token found - might be receiving hash fragment
          // Send a page that extracts hash params and redirects
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
          res.end(`<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Processing Authentication...</title>
</head>
<body>
<p>Processing authentication...</p>
<script>
if (window.location.hash) {
  var hash = window.location.hash.substring(1);
  window.location.href = window.location.pathname + '?' + hash;
} else {
  document.body.innerHTML = '<p>Authentication failed. Please try again.</p>';
}
</script>
</body>
</html>`)
        }
      } else {
        res.writeHead(404)
        res.end('Not Found')
      }
    })

    // Handle server errors gracefully
    authServer.on('error', (err) => {
      if ((err as NodeJS.ErrnoException).code !== 'EPIPE') {
        reject(err)
      }
      // Ignore EPIPE errors - they happen when browser closes connection early
    })

    authServer.listen(CALLBACK_PORT, '127.0.0.1')

    // Timeout after 5 minutes
    setTimeout(() => {
      if (authServer) {
        stopAuthServer()
        reject(new Error('Authentication timed out'))
      }
    }, 5 * 60 * 1000)
  })
}

/**
 * Stop the auth callback server
 */
export function stopAuthServer() {
  if (authServer) {
    authServer.close()
    authServer = null
  }
}

/**
 * Initiate SSO login flow
 */
export async function login(mainWindow: BrowserWindow): Promise<AuthTokens> {
  // Start the callback server
  const authPromise = startAuthServer()

  // Generate fresh OAuth URL with new state/nonce to avoid expiration issues
  const ssoUrl = generateSsoUrl()

  // Open browser to Google OAuth - after auth, Google redirects to API gateway,
  // which exchanges the code for tokens and redirects back to localhost:4200
  await shell.openExternal(ssoUrl)

  // Wait for callback
  const tokens = await authPromise

  // Notify renderer that auth is complete
  mainWindow.webContents.send('auth-success', tokens)

  return tokens
}

/**
 * Logout - clear stored tokens
 */
export function logout() {
  clearAuth()
  stopAuthServer()
}

/**
 * Check if user is authenticated
 */
export function isAuthenticated(): boolean {
  const auth = getAuth()
  return !!auth?.accessToken
}

/**
 * Get current auth state
 */
export function getAuthState() {
  const auth = getAuth()
  return {
    isAuthenticated: !!auth?.accessToken,
    user: auth?.user,
  }
}
