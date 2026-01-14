/**
 * IP Allowlist Middleware
 * Checks if the requesting IP is in the ADMIN_ALLOWED_IPS list
 */

function normalizeIP(ip) {
  // Remove IPv6 prefix for IPv4-mapped addresses
  // e.g., ::ffff:127.0.0.1 -> 127.0.0.1
  if (ip && ip.startsWith('::ffff:')) {
    return ip.substring(7);
  }
  return ip;
}

function ipAllowlist(req, res, next) {
  const allowedIPs = process.env.ADMIN_ALLOWED_IPS;
  
  if (!allowedIPs) {
    console.warn('[SECURITY] ADMIN_ALLOWED_IPS not configured, denying all access');
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'IP allowlist not configured' 
    });
  }

  const allowedList = allowedIPs.split(',').map(ip => ip.trim());
  const requestIP = normalizeIP(req.ip || req.connection.remoteAddress);

  console.log(`[IP-CHECK] Request from: ${requestIP}, Allowed: ${allowedList.join(', ')}`);

  if (allowedList.includes(requestIP)) {
    return next();
  }

  console.warn(`[SECURITY] Access denied for IP: ${requestIP}`);
  return res.status(403).json({ 
    error: 'Access denied',
    message: 'Your IP address is not authorized to access this resource',
    ip: requestIP
  });
}

module.exports = { ipAllowlist, normalizeIP };
