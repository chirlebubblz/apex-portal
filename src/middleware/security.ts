import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// 1. Rate Limiter: Max 100 requests per 15 minutes per IP
export const ingestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false
});

// 2. Input Sanitization (XSS Prevention)
function sanitizeString(val: string): string {
  // Strip any HTML/Script tag patterns (e.g. <script>alert(1)</script> -> alert(1))
  return val.replace(/<[^>]*>/g, '').trim();
}

function sanitizeObject(obj: any): any {
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  } else if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  } else if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        newObj[key] = sanitizeObject(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
}

export function sanitizeBody(req: Request, res: Response, next: NextFunction) {
  if (req.body) {
    req.body = sanitizeObject(req.body);
  }
  next();
}

// 3. Token Authorization (Access Control)
export function requireToken(req: Request, res: Response, next: NextFunction) {
  const secretToken = process.env.API_SECRET_TOKEN;
  
  // If API_SECRET_TOKEN is not configured in env variables, bypass authentication (sandbox mode)
  if (!secretToken) {
    return next();
  }

  const authHeader = req.headers['authorization'];
  const apiKeyHeader = req.headers['x-api-key'];

  let token = '';
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (apiKeyHeader) {
    token = String(apiKeyHeader);
  }

  if (token !== secretToken) {
    return res.status(401).json({ success: false, error: 'Unauthorized: Invalid API secret token' });
  }

  next();
}
