import { Module } from '../../models/v2/Module.js';

/**
 * verifyModuleHealth Middleware
 * 
 * Checks if module health_status is 'healthy' before allowing access.
 * Blocks access if module is 'offline', warns if 'degraded'.
 */
export const verifyModuleHealth = async (req, res, next) => {
  try {
    const moduleKey = req.params.moduleKey || req.body.module_key || req.query.module_key;
    
    if (!moduleKey) {
      return next(); // No module key, skip check
    }

    const module = await Module.findByKey(moduleKey);
    
    if (!module) {
      return res.status(404).json({
        error: 'Module not found',
        code: 'MODULE_NOT_FOUND'
      });
    }

    if (!module.is_active) {
      return res.status(403).json({
        error: 'Module is not active',
        code: 'MODULE_INACTIVE'
      });
    }

    const healthStatus = module.health_status || 'healthy';

    if (healthStatus === 'offline') {
      return res.status(503).json({
        error: 'Module is temporarily unavailable',
        code: 'MODULE_OFFLINE',
        message: `${module.name} is currently offline. Please try again later.`
      });
    }

    // If degraded, allow but add warning header
    if (healthStatus === 'degraded') {
      res.setHeader('X-Module-Status', 'degraded');
      res.setHeader('X-Module-Warning', `${module.name} is experiencing issues but is still operational.`);
    }

    next();
  } catch (error) {
    console.error('[verifyModuleHealth] Error:', error);
    // On error, allow access but log it
    console.warn('[verifyModuleHealth] Health check failed, allowing access with warning');
    next();
  }
};

