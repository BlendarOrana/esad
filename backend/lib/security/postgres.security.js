// lib/security/postgres.security.js
import pgEscape from 'pg-escape';

// SQL Injection Prevention Middleware
export const sqlInjectionProtection = (req, res, next) => {
  const checkForSQLInjection = (obj) => {
    const sqlKeywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'EXEC', 'EXECUTE', 'UNION', 'SCRIPT', 'JAVASCRIPT', 'VBSCRIPT',
      'ONLOAD', 'ONERROR', 'ONCLICK', '--', ';--', '/*', '*/', 'xp_',
      'sp_', 'INFORMATION_SCHEMA', 'SYSOBJECTS', 'SYSCOLUMNS'
    ];

    const checkValue = (value) => {
      if (typeof value === 'string') {
        const upperValue = value.toUpperCase();
        return sqlKeywords.some(keyword => 
          upperValue.includes(keyword) && 
          (upperValue.includes('=') || upperValue.includes('OR') || upperValue.includes('AND'))
        );
      }
      return false;
    };

    const checkObject = (obj) => {
      for (const key in obj) {
        // Fix: Use Object.hasOwn instead of obj.hasOwnProperty
        if (Object.hasOwn(obj, key)) {
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            if (checkObject(obj[key])) return true;
          } else if (checkValue(obj[key]) || checkValue(key)) {
            return true;
          }
        }
      }
      return false;
    };

    return checkObject(obj);
  };

  // Check request body, query params, and URL params
  if (req.body && checkForSQLInjection(req.body)) {
    return res.status(400).json({ error: 'Invalid request format' });
  }

  if (req.query && checkForSQLInjection(req.query)) {
    return res.status(400).json({ error: 'Invalid query format' });
  }

  if (req.params && checkForSQLInjection(req.params)) {
    return res.status(400).json({ error: 'Invalid parameter format' });
  }

  next();
};

// Sanitize input for PostgreSQL
export const sanitizeForPostgres = (input) => {
  if (typeof input === 'string') {
    return pgEscape.literal(input);
  } else if (typeof input === 'object' && input !== null) {
    const sanitized = {};
    for (const key in input) {
      // Fix: Use Object.hasOwn instead of input.hasOwnProperty
      if (Object.hasOwn(input, key)) {
        sanitized[key] = sanitizeForPostgres(input[key]);
      }
    }
    return sanitized;
  }
  return input;
};

// Database connection security
export const secureDbConnection = {
  // Connection pool settings
  max: 20, // Maximum number of connections
  min: 0,  // Minimum number of connections  
  idle: 10000, // Connection idle timeout
  acquire: 60000, // Connection acquire timeout
  evict: 1000, // Connection eviction interval
  
  // Security settings
  ssl: process.env.NODE_ENV === 'production' ? {
    require: true,
    rejectUnauthorized: false // Set to true in production with proper certificates
  } : false,
  
  // Query timeout
  statement_timeout: 30000, // 30 seconds
  
  // Connection timeout
  connectionTimeoutMillis: 5000,
  
  // Query logging (disable in production for security)
  logging: process.env.NODE_ENV === 'development' ? console.log : false
};

// Query parameter validation
export const validateQueryParams = (allowedFields) => {
  return (req, res, next) => {
    const { query } = req;
    
    // Check for allowed fields only
    const invalidFields = Object.keys(query).filter(
      field => !allowedFields.includes(field)
    );
    
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: 'Invalid query parameters',
        invalidFields
      });
    }
    
    // Validate pagination parameters
    if (query.page && (!Number.isInteger(+query.page) || +query.page < 1)) {
      return res.status(400).json({ error: 'Invalid page parameter' });
    }
    
    if (query.limit && (!Number.isInteger(+query.limit) || +query.limit < 1 || +query.limit > 100)) {
      return res.status(400).json({ error: 'Invalid limit parameter (1-100)' });
    }
    
    next();
  };
};

// Database transaction wrapper with error handling
export const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Prepared statement helper
export const executeQuery = async (query, params = []) => {
  const client = await pool.connect();
  try {
    // Log query in development (but not the actual parameters for security)
    if (process.env.NODE_ENV === 'development') {
      console.log('Executing query:', query.replace(/\$\d+/g, '?'));
    }
    
    const result = await client.query(query, params);
    return result;
  } catch (error) {
    console.error('Query execution error:', error.message);
    throw new Error('Database query failed');
  } finally {
    client.release();
  }
};