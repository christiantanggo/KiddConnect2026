// routes/menu.js
// Menu items management routes

import express from "express";
import { authenticate } from "../middleware/auth.js";
import { MenuItem } from "../models/MenuItem.js";
import { GlobalModifier } from "../models/GlobalModifier.js";

const router = express.Router();

// Get all menu items for the authenticated business
router.get("/", authenticate, async (req, res) => {
  try {
    const { includeUnavailable, category, activeOnly } = req.query;
    
    const options = {
      includeUnavailable: includeUnavailable === 'true',
      category: category || null,
      activeOnly: activeOnly !== 'false', // Default to true
    };
    
    const items = await MenuItem.findByBusinessId(req.businessId, options);
    
    res.json({ items });
  } catch (error) {
    console.error('[Menu API] Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// Get formatted menu (grouped by category)
router.get("/formatted", authenticate, async (req, res) => {
  try {
    const { includeUnavailable, activeOnly } = req.query;
    
    const options = {
      includeUnavailable: includeUnavailable === 'true',
      activeOnly: activeOnly !== 'false',
    };
    
    const formattedMenu = await MenuItem.getFormattedMenu(req.businessId, options);
    
    res.json(formattedMenu);
  } catch (error) {
    console.error('[Menu API] Error fetching formatted menu:', error);
    res.status(500).json({ error: 'Failed to fetch formatted menu' });
  }
});

// ============================================
// Global Modifiers Routes (MUST be before /:itemId)
// ============================================

// Get all global modifiers for the authenticated business
router.get("/global-modifiers", authenticate, async (req, res) => {
  try {
    const { activeOnly } = req.query;
    
    console.log('[Menu API] Fetching global modifiers:', {
      business_id: req.businessId,
      activeOnly_query: activeOnly,
    });
    
    const options = {
      activeOnly: activeOnly !== 'false', // Default to true
    };
    
    console.log('[Menu API] Options:', options);
    
    const modifiers = await GlobalModifier.findByBusinessId(req.businessId, options);
    
    console.log('[Menu API] ✅ Found', modifiers.length, 'global modifiers');
    
    res.json({ modifiers });
  } catch (error) {
    console.error('[Menu API] ❌ Error fetching global modifiers:', error);
    console.error('[Menu API] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: 'Failed to fetch global modifiers',
      details: error.message 
    });
  }
});

// Get single global modifier by ID
router.get("/global-modifiers/:modifierId", authenticate, async (req, res) => {
  try {
    const { modifierId } = req.params;
    const modifier = await GlobalModifier.findById(modifierId);
    
    if (!modifier || modifier.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Global modifier not found' });
    }
    
    res.json({ modifier });
  } catch (error) {
    console.error('[Menu API] Error fetching global modifier by ID:', error);
    res.status(500).json({ error: 'Failed to fetch global modifier' });
  }
});

// Create new global modifier
router.post("/global-modifiers", authenticate, async (req, res) => {
  try {
    const { name, description, price, is_free, category, is_active, display_order } = req.body;
    
    console.log('[Menu API] Creating global modifier:', {
      business_id: req.businessId,
      name,
      price,
      is_free,
      category,
    });
    
    if (!name) {
      return res.status(400).json({ error: 'Name is required to create a global modifier.' });
    }
    
    const newModifier = await GlobalModifier.create({
      business_id: req.businessId,
      name,
      description,
      price,
      is_free,
      category,
      is_active,
      display_order,
    });
    
    console.log('[Menu API] ✅ Global modifier created:', newModifier.id);
    res.status(201).json({ modifier: newModifier });
  } catch (error) {
    console.error('[Menu API] ❌ Error creating global modifier:', error);
    console.error('[Menu API] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: 'Failed to create global modifier',
      details: error.message 
    });
  }
});

// Update global modifier
router.put("/global-modifiers/:modifierId", authenticate, async (req, res) => {
  try {
    const { modifierId } = req.params;
    const updateData = req.body;
    
    const existingModifier = await GlobalModifier.findById(modifierId);
    if (!existingModifier || existingModifier.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Global modifier not found' });
    }
    
    const updatedModifier = await GlobalModifier.update(modifierId, updateData);
    
    res.json({ modifier: updatedModifier });
  } catch (error) {
    console.error('[Menu API] Error updating global modifier:', error);
    res.status(500).json({ error: 'Failed to update global modifier' });
  }
});

// Delete global modifier (soft delete)
router.delete("/global-modifiers/:modifierId", authenticate, async (req, res) => {
  try {
    const { modifierId } = req.params;
    
    const existingModifier = await GlobalModifier.findById(modifierId);
    if (!existingModifier || existingModifier.business_id !== req.businessId) {
      return res.status(404).json({ error: 'Global modifier not found' });
    }
    
    await GlobalModifier.delete(modifierId);
    
    res.status(204).send(); // No content
  } catch (error) {
    console.error('[Menu API] Error deleting global modifier:', error);
    res.status(500).json({ error: 'Failed to delete global modifier' });
  }
});

// Get single menu item by ID
router.get("/:itemId", authenticate, async (req, res) => {
  try {
    const { itemId } = req.params;
    const item = await MenuItem.findById(itemId);
    
    if (!item) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    // Verify item belongs to the business
    if (item.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json({ item });
  } catch (error) {
    console.error('[Menu API] Error fetching menu item:', error);
    res.status(500).json({ error: 'Failed to fetch menu item' });
  }
});

// Create new menu item
router.post("/", authenticate, async (req, res) => {
  try {
    const {
      name,
      description,
      category,
      price,
      is_available = true,
      display_order = 0,
      image_url,
      external_id,
      metadata = {},
      modifiers = { free: [], paid: [] },
      global_modifier_ids = [],
    } = req.body;
    
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }
    
    const item = await MenuItem.create({
      business_id: req.businessId,
      name,
      description,
      category,
      price: parseFloat(price),
      is_available,
      display_order: parseInt(display_order) || 0,
      image_url,
      external_id,
      metadata,
      modifiers,
      global_modifier_ids,
    });
    
    res.status(201).json({ item });
  } catch (error) {
    console.error('[Menu API] Error creating menu item:', error);
    res.status(500).json({ error: 'Failed to create menu item' });
  }
});

// Update menu item
router.put("/:itemId", authenticate, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    // Verify item exists and belongs to business
    const existingItem = await MenuItem.findById(itemId);
    if (!existingItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    if (existingItem.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const {
      name,
      description,
      category,
      price,
      is_available,
      is_active,
      display_order,
      image_url,
      external_id,
      metadata,
      modifiers,
      global_modifier_ids,
    } = req.body;
    
    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (category !== undefined) updateData.category = category;
    if (price !== undefined) updateData.price = parseFloat(price);
    if (is_available !== undefined) updateData.is_available = is_available;
    if (is_active !== undefined) updateData.is_active = is_active;
    if (display_order !== undefined) updateData.display_order = parseInt(display_order) || 0;
    if (image_url !== undefined) updateData.image_url = image_url;
    if (external_id !== undefined) updateData.external_id = external_id;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (modifiers !== undefined) updateData.modifiers = modifiers;
    if (global_modifier_ids !== undefined) updateData.global_modifier_ids = global_modifier_ids;
    
    console.log('[Menu API] Updating menu item:', {
      itemId,
      updateDataKeys: Object.keys(updateData),
      global_modifier_ids: updateData.global_modifier_ids,
    });
    
    const updatedItem = await MenuItem.update(itemId, updateData);
    
    console.log('[Menu API] ✅ Menu item updated successfully');
    res.json({ item: updatedItem });
  } catch (error) {
    console.error('[Menu API] ❌ Error updating menu item:', error);
    console.error('[Menu API] Error details:', {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    res.status(500).json({ 
      error: 'Failed to update menu item',
      details: error.message 
    });
  }
});

// Delete menu item (soft delete)
router.delete("/:itemId", authenticate, async (req, res) => {
  try {
    const { itemId } = req.params;
    
    // Verify item exists and belongs to business
    const existingItem = await MenuItem.findById(itemId);
    if (!existingItem) {
      return res.status(404).json({ error: 'Menu item not found' });
    }
    
    if (existingItem.business_id !== req.businessId) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    await MenuItem.delete(itemId);
    
    res.json({ success: true });
  } catch (error) {
    console.error('[Menu API] Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

export default router;

