const crypto = require('crypto');

const externalLoginUrl = 'https://atfalna.sa/wp-json/external-auth/v1/login';
const jwtSecret = process.env.JWT_SECRET || 'change-this-jwt-secret';
const tokenLifetimeSeconds = 60 * 60 * 24;

const ROLE_MAP = {
  um_custom_role_1: 'موظف استقبال',
  um_custom_role_2: 'مستفيد',
  um_custom_role_3: 'باحث اجتماعي',
  um_custom_role_4: 'عضو اللجنة الطبية',
  um_custom_role_5: 'رئيس اللجنة الطبية',
  um_custom_role_6: 'امين اللجنة الطبية',
  um_custom_role_7: 'مدير مالية',
  um_custom_role_8: 'المدير التنفيذي'
};

function findRoleKey(value) {
  if (typeof value === 'string' && ROLE_MAP[value]) return value;
  if (Array.isArray(value)) {
    return value.map(findRoleKey).find(Boolean) || null;
  }
  if (value && typeof value === 'object') {
    if (ROLE_MAP[value.um_custom_role_id]) return value.um_custom_role_id;
    if (ROLE_MAP[value.role]) return value.role;
    if (ROLE_MAP[value.role_id]) return value.role_id;
    return Object.keys(value).find((key) => ROLE_MAP[key])
      || Object.values(value).map(findRoleKey).find(Boolean)
      || null;
  }
  return null;
}

function withTranslatedRole(user) {
  const roleKey = findRoleKey(user.um_custom_role_id)
    || findRoleKey(user.role)
    || findRoleKey(user.role_id)
    || findRoleKey(user.roles)
    || findRoleKey(user.meta)
    || findRoleKey(user);
  if (!roleKey) return user;

  return {
    ...user,
    um_custom_role_id: roleKey,
    role: ROLE_MAP[roleKey]
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function createJwt(user) {
  const header = base64UrlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const now = Math.floor(Date.now() / 1000);
  const payload = base64UrlEncode(JSON.stringify({
    sub: String(user.id ?? user.ID ?? user.user_id),
    iat: now,
    exp: now + tokenLifetimeSeconds,
    user
  }));
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto
    .createHmac('sha256', jwtSecret)
    .update(unsignedToken)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${unsignedToken}.${signature}`;
}

function getUserFromResponse(data) {
  return data?.user || data?.data?.user || data?.data || data?.user_data || data;
}

async function login(request, response) {
  const { email, password } = request.body || {};
  if (!email || !password) {
    return response.status(400).json({
      success: false,
      error: 'Email and password are required',
      code: 'MISSING_CREDENTIALS'
    });
  }

  try {
    const externalResponse = await fetch(externalLoginUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(10000)
    });

    const externalData = await externalResponse.json().catch(() => null);
    if (!externalResponse.ok || externalData?.success === false) {
      return response.status(externalResponse.status >= 400 ? externalResponse.status : 401).json({
        success: false,
        error: externalData?.message || externalData?.error || 'Invalid email or password',
        code: 'INVALID_CREDENTIALS'
      });
    }

    const user = getUserFromResponse(externalData);
    if (!user || typeof user !== 'object') {
      return response.status(502).json({
        success: false,
        error: 'Authentication service returned an invalid user',
        code: 'INVALID_AUTH_RESPONSE'
      });
    }

    const translatedUser = withTranslatedRole(user);
    return response.json({
      success: true,
      token: createJwt(translatedUser),
      user: translatedUser
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') {
      return response.status(504).json({
        success: false,
        error: 'Authentication service timed out',
        code: 'AUTH_SERVICE_TIMEOUT'
      });
    }

    console.error('External authentication error:', error.message);
    return response.status(502).json({
      success: false,
      error: 'Authentication service unavailable',
      code: 'AUTH_SERVICE_UNAVAILABLE'
    });
  }
}

module.exports = {
  login,
  createJwt,
  jwtSecret
};
