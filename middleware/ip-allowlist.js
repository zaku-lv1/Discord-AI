/**
 * IP Allowlist Middleware
 * Restricts access to specific routes based on IP address
 * IPv4 normalization: converts ::ffff:1.2.3.4 to 1.2.3.4
 * No trust proxy setting used (as requested)
 */

function normalizeIPv4(ip) {
  if (!ip) return '';
  
  // Convert IPv6-mapped IPv4 to plain IPv4
  // e.g., ::ffff:192.168.1.1 -> 192.168.1.1
  const ipv6Prefix = '::ffff:';
  if (ip.startsWith(ipv6Prefix)) {
    return ip.substring(ipv6Prefix.length);
  }
  
  return ip;
}

function createIPAllowlist() {
  const allowedIPsString = process.env.ADMIN_ALLOWED_IPS || '';
  const allowedIPs = allowedIPsString
    .split(',')
    .map(ip => ip.trim())
    .filter(ip => ip.length > 0);
  
  return (req, res, next) => {
    // If no IPs are configured, deny all access
    if (allowedIPs.length === 0) {
      console.warn('[IP Allowlist] No IPs configured in ADMIN_ALLOWED_IPS. Access denied.');
      return res.status(403).json({ 
        error: 'Access denied',
        message: 'IP allowlist is not configured' 
      });
    }
    
    // Get client IP from socket (not using trust proxy)
    const clientIP = normalizeIPv4(req.socket.remoteAddress || req.connection.remoteAddress || '');
    
    // Check if IP is in allowlist
    if (allowedIPs.includes(clientIP)) {
      console.log(`[IP Allowlist] Access granted for IP: ${clientIP}`);
      return next();
    }
    
    // Deny access
    console.warn(`[IP Allowlist] Access denied for IP: ${clientIP}. Allowed IPs: ${allowedIPs.join(', ')}`);
    return res.status(403).json({ 
      error: 'Access denied',
      message: 'Your IP address is not authorized to access this resource',
      clientIP: clientIP
    });
  };
}

module.exports = {
  createIPAllowlist,
  normalizeIPv4
};
