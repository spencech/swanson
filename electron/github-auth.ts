import { shell } from 'electron'
import { getGitHubAuth, setGitHubAuth } from './store'
import { GITHUB_CLIENT_ID } from '../config/constants'

const GITHUB_DEVICE_CODE_URL = 'https://github.com/login/device/code'
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token'
const GITHUB_SCOPE = 'repo read:org'

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  token_type: string
  scope: string
  expires_in?: number
}

export interface GitHubAuthFlow {
  userCode: string
  verificationUri: string
  pollForToken: () => Promise<TokenResponse>
}

/**
 * Start GitHub OAuth Device Flow
 */
export async function startGitHubDeviceFlow(): Promise<GitHubAuthFlow> {
  // Request device code
  const response = await fetch(GITHUB_DEVICE_CODE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      scope: GITHUB_SCOPE,
    }),
  })

  if (!response.ok) {
    throw new Error(`Failed to start device flow: ${response.statusText}`)
  }

  const deviceCodeData: DeviceCodeResponse = await response.json()

  // Store device code info for polling
  console.log('startGitHubDeviceFlow: Storing device code', {
    deviceCode: deviceCodeData.device_code.substring(0, 10) + '...',
    expiresIn: deviceCodeData.expires_in,
    interval: deviceCodeData.interval,
  })
  
  setGitHubAuth({
    deviceCode: deviceCodeData.device_code,
    deviceCodeExpiresAt: Date.now() + deviceCodeData.expires_in * 1000,
    deviceCodeInterval: deviceCodeData.interval,
  })
  
  // Verify it was stored
  const verifyAuth = getGitHubAuth()
  if (!verifyAuth?.deviceCode) {
    console.error('startGitHubDeviceFlow: Device code was not stored!', { verifyAuth })
    throw new Error('Failed to store device code')
  }
  console.log('startGitHubDeviceFlow: Device code stored successfully')

  // Don't open browser automatically - let user see code first
  // Browser will be opened when user clicks "Open GitHub" button

  // Return polling function that uses stored device code
  const pollForToken = async (): Promise<TokenResponse> => {
    return pollDeviceCodeToken()
  }

  return {
    userCode: deviceCodeData.user_code,
    verificationUri: deviceCodeData.verification_uri,
    pollForToken,
  }
}

/**
 * Poll for token using stored device code
 */
export async function pollDeviceCodeToken(): Promise<TokenResponse> {
  console.log('pollDeviceCodeToken: Function called')
  
  // Get fresh auth state - don't cache it
  const auth = getGitHubAuth()
  
  // Debug logging
  console.log('pollDeviceCodeToken: Checking for device code', {
    hasAuth: !!auth,
    authType: typeof auth,
    authKeys: auth ? Object.keys(auth) : 'no auth',
    hasDeviceCode: !!auth?.deviceCode,
    deviceCodeValue: auth?.deviceCode ? auth.deviceCode.substring(0, 10) + '...' : 'undefined',
    deviceCodeLength: auth?.deviceCode?.length,
    expiresAt: auth?.deviceCodeExpiresAt,
    currentTime: Date.now(),
    fullAuth: JSON.stringify(auth),
  })

  if (!auth?.deviceCode) {
    console.error('pollDeviceCodeToken: No device code found!', { 
      auth,
      authType: typeof auth,
      authKeys: auth ? Object.keys(auth) : 'no auth',
      fullAuthString: JSON.stringify(auth),
    })
    throw new Error('No device code found. Please start the authentication flow again.')
  }

  if (auth.deviceCodeExpiresAt && Date.now() >= auth.deviceCodeExpiresAt) {
    // Clear expired device code
    console.log('pollDeviceCodeToken: Device code expired, clearing')
    setGitHubAuth({
      deviceCode: undefined,
      deviceCodeExpiresAt: undefined,
      deviceCodeInterval: undefined,
    })
    throw new Error('Device code expired. Please restart the authentication flow.')
  }

  let pollInterval = (auth.deviceCodeInterval || 5) * 1000 // Convert to milliseconds
  const expiresAt = auth.deviceCodeExpiresAt || Date.now() + 900 * 1000 // Default 15 minutes

  const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: auth.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  })
  
  console.log('pollDeviceCodeToken: Token response status', {
    ok: tokenResponse.ok,
    status: tokenResponse.status,
    statusText: tokenResponse.statusText,
  })

  const responseText = await tokenResponse.text()
  console.log('pollDeviceCodeToken: Raw response text', responseText.substring(0, 200))
  
  // Parse response to check for errors (GitHub returns errors with HTTP 200)
  const responseData = JSON.parse(responseText)
  
  // Check for error responses first (GitHub returns these with HTTP 200)
  if (responseData.error) {
    console.log('pollDeviceCodeToken: Error response detected', {
      error: responseData.error,
      errorDescription: responseData.error_description,
      interval: responseData.interval,
    })
    if (responseData.error === 'authorization_pending') {
      // Continue polling - throw a special error that the caller can catch
      console.log('pollDeviceCodeToken: Throwing AUTHORIZATION_PENDING')
      throw new Error('AUTHORIZATION_PENDING')
    } else if (responseData.error === 'slow_down') {
      // Increase polling interval and update stored interval
      const newInterval = responseData.interval || (pollInterval / 1000) * 1.5
      pollInterval = Math.min(newInterval * 1000, 60000) // Convert to milliseconds, cap at 60 seconds
      console.log('pollDeviceCodeToken: SLOW_DOWN - updating interval', {
        oldInterval: auth.deviceCodeInterval,
        newInterval: pollInterval / 1000,
        responseInterval: responseData.interval,
      })
      setGitHubAuth({
        deviceCodeInterval: pollInterval / 1000,
      })
      console.log('pollDeviceCodeToken: Throwing SLOW_DOWN')
      throw new Error('SLOW_DOWN')
    } else if (responseData.error === 'expired_token') {
      // Clear expired device code
      console.log('pollDeviceCodeToken: Device code expired, clearing')
      setGitHubAuth({
        deviceCode: undefined,
        deviceCodeExpiresAt: undefined,
        deviceCodeInterval: undefined,
      })
      throw new Error('Device code expired. Please restart the authentication flow.')
    } else if (responseData.error === 'access_denied') {
      // Clear device code
      setGitHubAuth({
        deviceCode: undefined,
        deviceCodeExpiresAt: undefined,
        deviceCodeInterval: undefined,
      })
      throw new Error('Access denied. User rejected the authorization request.')
    } else {
      throw new Error(`Token request failed: ${responseData.error_description || responseData.error}`)
    }
  }

  // If we get here, it's a successful token response (no error field)
  console.log('pollDeviceCodeToken: Success! No error in response, parsing token data')
  if (!tokenResponse.ok) {
    throw new Error(`Token request failed: ${tokenResponse.statusText}`)
  }

  const tokenData: TokenResponse = responseData
  
  console.log('pollDeviceCodeToken: Parsed token data', {
    hasAccessToken: !!tokenData.access_token,
    hasRefreshToken: !!tokenData.refresh_token,
    expiresIn: tokenData.expires_in,
    tokenType: tokenData.token_type,
    scope: tokenData.scope,
    accessTokenPreview: tokenData.access_token ? tokenData.access_token.substring(0, 10) + '...' : 'undefined',
    refreshTokenPreview: tokenData.refresh_token ? tokenData.refresh_token.substring(0, 10) + '...' : 'undefined',
    allKeys: Object.keys(tokenData),
  })

  // Store tokens (but DON'T clear device code yet - wait until user is fetched successfully)
  // This allows retry if getAuthenticatedUser() fails
  const tokensToStore = {
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token,
    expiresAt: tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : undefined,
  }
  console.log('pollDeviceCodeToken: About to store tokens', {
    hasAccessToken: !!tokensToStore.accessToken,
    hasRefreshToken: !!tokensToStore.refreshToken,
    expiresAt: tokensToStore.expiresAt,
  })
  
  // Log the access token for user to copy
  console.log('========================================')
  console.log('GitHub Access Token:', tokenData.access_token)
  console.log('========================================')
  
  setGitHubAuth(tokensToStore)

  return tokenData
}

/**
 * Refresh GitHub access token using refresh token
 */
export async function refreshGitHubToken(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(GITHUB_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(`Token refresh failed: ${error.error_description || error.error || response.statusText}`)
  }

  const tokenData: TokenResponse = await response.json()

  // Update stored tokens
  setGitHubAuth({
    accessToken: tokenData.access_token,
    refreshToken: tokenData.refresh_token || refreshToken, // Keep old refresh token if new one not provided
    expiresAt: tokenData.expires_in
      ? Date.now() + tokenData.expires_in * 1000
      : undefined,
  })
  
  // Log the refreshed access token
  console.log('========================================')
  console.log('GitHub Access Token (refreshed):', tokenData.access_token)
  console.log('========================================')

  return tokenData
}

/**
 * Ensure GitHub token is valid, refreshing if necessary
 */
export async function ensureValidGitHubToken(): Promise<string> {
  const auth = getGitHubAuth()
  if (!auth?.accessToken) {
    throw new Error('GitHub not connected')
  }

  // Check if token is expired or expires soon (< 5 minutes)
  if (auth.expiresAt && Date.now() >= auth.expiresAt - 5 * 60 * 1000) {
    if (!auth.refreshToken) {
      throw new Error('Token expired and no refresh token available')
    }
    await refreshGitHubToken(auth.refreshToken)
    const refreshedAuth = getGitHubAuth()
    if (!refreshedAuth?.accessToken) {
      throw new Error('Failed to refresh token')
    }
    return refreshedAuth.accessToken
  }

  return auth.accessToken
}
