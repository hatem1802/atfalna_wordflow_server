const crypto = require('crypto');
const database = require('../database');
const { jwtSecret, ROLE_MAP } = require('../controllers/authController');

/** Maps JWT/login role labels to treatment_requests.stage enum values */
const ROLE_TO_STAGE = {
  مستفيد: 'مستفيد',
  Beneficiary: 'مستفيد',
  beneficiary: 'مستفيد',
  'باحث اجتماعي': 'باحث اجتماعي',
  'عضو اللجنة الطبية': 'عضو لجنة طبية',
  'رئيس اللجنة الطبية': 'رئيس لجنة طبية',
  'امين اللجنة الطبية': 'أمين لجنة',
  'مدير مالية': 'مالية',
  'المدير التنفيذي': 'مدير تنفيذي',
  'موظف استقبال': 'باحث اجتماعي',
  'مدير النظام': 'مدير النظام'
};

function base64UrlDecode(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
}

function verifyJwt(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', jwtSecret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest();
    const actualSignature = base64UrlDecode(encodedSignature);
    if (actualSignature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(actualSignature, expectedSignature)) return null;

    const header = JSON.parse(base64UrlDecode(encodedHeader).toString('utf8'));
    const payload = JSON.parse(base64UrlDecode(encodedPayload).toString('utf8'));
    if (header.alg !== 'HS256' || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (error) {
    return null;
  }
}

function roleKeyFromCapabilities(metaValue) {
  if (!metaValue || typeof metaValue !== 'string') return null;
  return Object.keys(ROLE_MAP).find((key) => metaValue.includes(key)) || null;
}

function isWpAdministrator(metaValue) {
  if (!metaValue || typeof metaValue !== 'string') return false;
  // WordPress serializes caps like: ..."administrator";b:1;...
  return metaValue.includes('administrator');
}

const ALL_REQUESTS_ROLES = new Set(['Administrator', 'المدير التنفيذي', 'مدير النظام']);

function getTokenUserId(jwtPayload) {
  const user = jwtPayload?.user || {};
  return user.id ?? user.ID ?? user.user_id ?? jwtPayload?.sub ?? null;
}

/**
 * Verify Bearer JWT, then load/validate the user against WordPress DB tables.
 * Sets req.user with fresh id, email, name, role, um_custom_role_id, stage,
 * and canViewAllRequests for elevated roles.
 */
const authenticateFromDb = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization header',
        code: 'INVALID_AUTH_HEADER'
      });
    }

    const jwtPayload = verifyJwt(token);
    if (!jwtPayload?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }

    const userId = getTokenUserId(jwtPayload);
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Token missing user id',
        code: 'INVALID_TOKEN_USER'
      });
    }

    const [rows] = await database.execute(
      `SELECT u.ID AS id, u.user_email AS email, u.display_name AS name,
              um.meta_value AS capabilities
       FROM \`33fubbf_users\` u
       LEFT JOIN \`33fubbf_usermeta\` um
         ON um.user_id = u.ID AND um.meta_key = '33FuBbf_capabilities'
       WHERE u.ID = ?
       LIMIT 1`,
      [userId]
    );

    if (!rows.length) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    const dbUser = rows[0];
    const roleKey = roleKeyFromCapabilities(dbUser.capabilities);
    const isAdmin = isWpAdministrator(dbUser.capabilities);

    let role;
    let umCustomRoleId = roleKey;

    if (roleKey && ROLE_MAP[roleKey]) {
      role = ROLE_MAP[roleKey];
    } else if (isAdmin) {
      role = 'Administrator';
      umCustomRoleId = null;
    } else {
      return res.status(403).json({
        success: false,
        error: 'User has no recognized role',
        code: 'ROLE_NOT_FOUND'
      });
    }

    // WP administrator capability elevates even when a UM role is also present
    if (isAdmin) {
      role = 'Administrator';
    }

    const stage = ROLE_TO_STAGE[role] || null;
    const canViewAllRequests = ALL_REQUESTS_ROLES.has(role);

    req.user = {
      ...jwtPayload.user,
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      display_name: dbUser.name,
      um_custom_role_id: umCustomRoleId,
      role,
      stage,
      canViewAllRequests
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * Authentication middleware - verifies JWT only (no DB lookup)
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const [bearer, token] = authHeader.split(' ');
    if (bearer !== 'Bearer' || !token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid authorization header',
        code: 'INVALID_AUTH_HEADER'
      });
    }

    const jwtPayload = verifyJwt(token);
    if (!jwtPayload?.user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN'
      });
    }
    req.user = jwtPayload.user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED'
    });
  }
};

/**
 * RBAC middleware - checks if user has required role(s)
 * @param {string|string[]} allowedRoles - Role or array of roles that can access
 */
const authorize = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    const roles = Array.isArray(allowedRoles) ? allowedRoles : [allowedRoles];

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

/**
 * Check if user is beneficiary (مستفيد)
 */
const isBeneficiary = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (!['Beneficiary', 'beneficiary', 'مستفيد'].includes(req.user.role)) {
    return res.status(403).json({
      success: false,
      error: 'Only beneficiaries can perform this action',
      code: 'FORBIDDEN'
    });
  }

  next();
};

/**
 * Check if user is staff (non-beneficiary/non-مستفيد)
 */
const isStaff = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role === 'مستفيد') {
    return res.status(403).json({
      success: false,
      error: 'Only staff can perform this action',
      code: 'FORBIDDEN'
    });
  }

  next();
};

/**
 * Verify that a beneficiary can only access their own data
 * Attach the beneficiary_id to req.params if user is beneficiary
 */
const verifySelfOrStaff = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({
      success: false,
      error: 'Authentication required',
      code: 'AUTH_REQUIRED'
    });
  }

  if (req.user.role === 'مستفيد') {
    req.params.beneficiaryId = req.user.id;
  }

  next();
};

module.exports = {
  authenticate,
  authenticateFromDb,
  authorize,
  isBeneficiary,
  isStaff,
  verifySelfOrStaff,
  ROLE_TO_STAGE
};
