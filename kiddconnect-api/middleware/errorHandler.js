// middleware/errorHandler.js
// Centralized error handling middleware

export function errorHandler(err, req, res, next) {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV === 'development';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation failed',
      details: isDevelopment ? err.message : 'Invalid input provided',
    });
  }

  if (err.name === 'UnauthorizedError' || err.message === 'Unauthorized') {
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  if (err.name === 'ForbiddenError' || err.message === 'Forbidden') {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'You do not have permission to access this resource',
    });
  }

  if (err.name === 'NotFoundError' || err.message === 'Not found') {
    return res.status(404).json({
      error: 'Not found',
      message: 'The requested resource was not found',
    });
  }

  // Database errors
  if (err.code === '23505') { // Unique constraint violation
    return res.status(409).json({
      error: 'Conflict',
      message: 'A record with this information already exists',
    });
  }

  // Default error response
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: isDevelopment ? err.message : 'An unexpected error occurred',
    ...(isDevelopment && { stack: err.stack }),
  });
}
