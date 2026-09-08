const crypto = require('crypto');
const { jwtSecret } = require('../controllers/authController');

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

/**
 * Authentication middleware - verifies user is logged in
 * In a real application, this would verify JWT tokens or session
 * For this implementation, we assume req.user is set by authentication layer
 * or use a mock user ID from headers for testing
 */
const authenticate = async (req, res, next) => {
  try {
    // In production, this would verify JWT token
    // For now, we support user ID from Authorization header for testing
    // Format: Authorization: Bearer userId_roleType
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false, 
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    // Parse and verify the locally issued JWT.
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
    // Beneficiary (مستفيد) can only access their own resources
    req.params.beneficiaryId = req.user.id;
  }

  next();
};

module.exports = {
  authenticate,
  authorize,
  isBeneficiary,
  isStaff,
  verifySelfOrStaff
};
