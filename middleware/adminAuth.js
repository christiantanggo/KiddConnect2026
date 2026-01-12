// middleware/adminAuth.js
// Admin authentication middleware

import { verifyToken } from "../utils/auth.js";
import { AdminUser } from "../models/AdminUser.js";

export const authenticateAdmin = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "No token provided" });
    }

    const token = authHeader.substring(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Check if this is an admin token (different from regular user tokens)
    if (!decoded.adminId) {
      return res.status(403).json({ error: "Admin access required" });
    }

    const admin = await AdminUser.findById(decoded.adminId);

    if (!admin || !admin.is_active) {
      return res.status(401).json({ error: "Admin not found or inactive" });
    }

    req.admin = admin;
    req.adminId = admin.id;
    next();
  } catch (error) {
    console.error("Admin auth middleware error:", error);
    return res.status(401).json({ error: "Authentication failed" });
  }
};
















