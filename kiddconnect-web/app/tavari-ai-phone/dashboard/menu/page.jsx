'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import V2AppShell from '@/components/V2AppShell';
import PhoneAgentV2ActionCards from '@/components/PhoneAgentV2ActionCards';
import { menuAPI } from '@/lib/api';
import { useToast } from '@/components/ToastProvider';

function MenuPage() {
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState('items'); // 'items' or 'global-modifiers'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState([]);
  const [globalModifiers, setGlobalModifiers] = useState([]);
  const [editingItem, setEditingItem] = useState(null);
  const [editingModifier, setEditingModifier] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddModifierForm, setShowAddModifierForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    category: '',
    price: '',
    is_available: true,
    display_order: 0,
    modifiers: { free: [], paid: [] },
    global_modifier_ids: [], // Array of global modifier IDs
  });
  const [modifierFormData, setModifierFormData] = useState({
    name: '',
    description: '',
    price: '',
    is_free: true,
    category: '',
    is_active: true,
    display_order: 0,
  });

  useEffect(() => {
    loadMenuItems();
    loadGlobalModifiers();
  }, []);

  const loadMenuItems = async () => {
    try {
      setLoading(true);
      const response = await menuAPI.getAll({ activeOnly: false, includeUnavailable: true });
      setItems(response.data.items || []);
    } catch (error) {
      console.error('Failed to load menu items:', error);
      showError('Failed to load menu items');
    } finally {
      setLoading(false);
    }
  };

  const loadGlobalModifiers = async () => {
    try {
      const response = await menuAPI.getGlobalModifiers({ activeOnly: false });
      setGlobalModifiers(response.data.modifiers || []);
    } catch (error) {
      console.error('Failed to load global modifiers:', error);
      showError('Failed to load global modifiers');
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleModifierInputChange = (field, value) => {
    setModifierFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      category: '',
      price: '',
      is_available: true,
      display_order: 0,
      modifiers: { free: [], paid: [] },
      global_modifier_ids: [],
    });
    setEditingItem(null);
    setShowAddForm(false);
  };

  const resetModifierForm = () => {
    setModifierFormData({
      name: '',
      description: '',
      price: '',
      is_free: true,
      category: '',
      is_active: true,
      display_order: 0,
    });
    setEditingModifier(null);
    setShowAddModifierForm(false);
  };

  const handleEdit = (item) => {
    setEditingItem(item.id);
    setFormData({
      name: item.name || '',
      description: item.description || '',
      category: item.category || '',
      price: item.price || '',
      is_available: item.is_available ?? true,
      display_order: item.display_order || 0,
      modifiers: item.modifiers || { free: [], paid: [] },
      global_modifier_ids: item.global_modifier_ids || [],
    });
    setShowAddForm(true);
  };

  const handleEditModifier = (modifier) => {
    setEditingModifier(modifier.id);
    setModifierFormData({
      name: modifier.name || '',
      description: modifier.description || '',
      price: modifier.price || '',
      is_free: modifier.is_free !== false,
      category: modifier.category || '',
      is_active: modifier.is_active !== false,
      display_order: modifier.display_order || 0,
    });
    setShowAddModifierForm(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.price) {
      showError('Name and price are required');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        await menuAPI.update(editingItem, formData);
        success('Menu item updated successfully');
      } else {
        await menuAPI.create(formData);
        success('Menu item created successfully');
      }
      resetForm();
      loadMenuItems();
    } catch (error) {
      console.error('Failed to save menu item:', error);
      showError(error.response?.data?.error || 'Failed to save menu item');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveModifier = async () => {
    if (!modifierFormData.name) {
      showError('Name is required');
      return;
    }

    setSaving(true);
    try {
      if (editingModifier) {
        await menuAPI.updateGlobalModifier(editingModifier, modifierFormData);
        success('Global modifier updated successfully');
      } else {
        await menuAPI.createGlobalModifier(modifierFormData);
        success('Global modifier created successfully');
      }
      resetModifierForm();
      loadGlobalModifiers();
    } catch (error) {
      console.error('Failed to save global modifier:', error);
      showError(error.response?.data?.error || 'Failed to save global modifier');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (itemId) => {
    if (!confirm('Are you sure you want to delete this menu item? This action cannot be undone.')) {
      return;
    }

    try {
      await menuAPI.delete(itemId);
      success('Menu item deleted successfully');
      loadMenuItems();
    } catch (error) {
      console.error('Failed to delete menu item:', error);
      showError('Failed to delete menu item');
    }
  };

  const handleDeleteModifier = async (modifierId) => {
    if (!confirm('Are you sure you want to delete this global modifier? This will remove it from all menu items that use it.')) {
      return;
    }

    try {
      await menuAPI.deleteGlobalModifier(modifierId);
      success('Global modifier deleted successfully');
      loadGlobalModifiers();
    } catch (error) {
      console.error('Failed to delete global modifier:', error);
      showError('Failed to delete global modifier');
    }
  };

  const toggleAvailability = async (item) => {
    try {
      await menuAPI.update(item.id, { is_available: !item.is_available });
      success(`Menu item ${item.is_available ? 'unavailable' : 'available'}`);
      loadMenuItems();
    } catch (error) {
      console.error('Failed to update availability:', error);
      showError('Failed to update availability');
    }
  };

  // Group items by category
  const itemsByCategory = items.reduce((acc, item) => {
    const category = item.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(item);
    return acc;
  }, {});

  const categories = Object.keys(itemsByCategory).sort();

  // Group modifiers by category
  const modifiersByCategory = globalModifiers.reduce((acc, modifier) => {
    const category = modifier.category || 'Uncategorized';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(modifier);
    return acc;
  }, {});

  const modifierCategories = Object.keys(modifiersByCategory).sort();

  if (loading) {
    return (
      <AuthGuard>
        <V2AppShell>
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-lg" style={{ color: 'var(--color-text-muted)' }}>Loading...</div>
          </div>
        </V2AppShell>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <V2AppShell>
        <div 
          style={{ 
            maxWidth: 'var(--max-content-width)', 
            margin: '0 auto',
            padding: 'calc(var(--padding-base) * 1.5) var(--padding-base)',
            minHeight: 'calc(100vh - var(--topbar-height))',
          }}
        >
          {/* Module Action Cards */}
          <PhoneAgentV2ActionCards />

          <div className="mb-6">
            <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--color-text-main)' }}>Menu Management</h1>
            <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Manage your menu items and global modifiers for takeout orders.</p>
          </div>

          {/* Tabs */}
          <div className="mb-6" style={{ borderBottom: '1px solid var(--color-border)' }}>
            <nav className="flex space-x-8 -mb-px">
              <button
                onClick={() => setActiveTab('items')}
                className="py-4 px-1 border-b-2 font-medium text-sm transition-colors"
                style={{
                  borderColor: activeTab === 'items' ? 'var(--color-accent)' : 'transparent',
                  color: activeTab === 'items' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== 'items') {
                    e.target.style.color = 'var(--color-text-main)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== 'items') {
                    e.target.style.color = 'var(--color-text-muted)';
                  }
                }}
              >
                Menu Items
              </button>
              <button
                onClick={() => setActiveTab('global-modifiers')}
                className="py-4 px-1 border-b-2 font-medium text-sm transition-colors"
                style={{
                  borderColor: activeTab === 'global-modifiers' ? 'var(--color-accent)' : 'transparent',
                  color: activeTab === 'global-modifiers' ? 'var(--color-accent)' : 'var(--color-text-muted)',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== 'global-modifiers') {
                    e.target.style.color = 'var(--color-text-main)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== 'global-modifiers') {
                    e.target.style.color = 'var(--color-text-muted)';
                  }
                }}
              >
                Global Modifiers
              </button>
            </nav>
          </div>

          {/* Menu Items Tab */}
          {activeTab === 'items' && (
            <>
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Items are automatically numbered (#1, #2, etc.) for easy AI recognition.</p>
                </div>
                <button
                  onClick={() => {
                    resetForm();
                    setShowAddForm(true);
                  }}
                  className="px-4 py-2 text-white font-medium transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  + Add Item
                </button>
              </div>

              {showAddForm && (
                <div 
                  className="mb-6 shadow p-6"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--card-radius)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                    {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => handleInputChange('name', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="e.g., Cheeseburger"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Price <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.price}
                        onChange={(e) => handleInputChange('price', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="0.00"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Category
                      </label>
                      <input
                        type="text"
                        value={formData.category}
                        onChange={(e) => handleInputChange('category', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="e.g., Main Courses, Appetizers"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Display Order
                      </label>
                      <input
                        type="number"
                        value={formData.display_order}
                        onChange={(e) => handleInputChange('display_order', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="0"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Description
                      </label>
                      <textarea
                        value={formData.description}
                        onChange={(e) => handleInputChange('description', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        rows="3"
                        placeholder="Item description..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={formData.is_available}
                          onChange={(e) => handleInputChange('is_available', e.target.checked)}
                          className="mr-2"
                          style={{ accentColor: 'var(--color-accent)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>Available for ordering</span>
                      </label>
                    </div>
                    
                    {/* Global Modifiers Section */}
                    <div className="md:col-span-2 pt-4 mt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>Global Modifiers</h3>
                      <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                        Select global modifiers that apply to this item. These are reusable modifiers you've created.
                      </p>
                      {globalModifiers.length === 0 ? (
                        <div className="p-4 text-center" style={{ backgroundColor: 'var(--color-background)', border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)' }}>
                          <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
                            No global modifiers available. Create them in the "Global Modifiers" tab first.
                          </p>
                        </div>
                      ) : (
                        <div className="p-4 max-h-64 overflow-y-auto" style={{ border: '1px solid var(--color-border)', borderRadius: 'var(--card-radius)', backgroundColor: 'var(--color-background)' }}>
                          <div className="space-y-2">
                            {globalModifiers.map((modifier) => {
                              const isSelected = (formData.global_modifier_ids || []).includes(modifier.id);
                              return (
                                <label
                                  key={modifier.id}
                                  className="flex items-center gap-3 p-2 rounded-md cursor-pointer transition-colors"
                                  style={{
                                    backgroundColor: isSelected ? 'rgba(20, 184, 166, 0.1)' : 'transparent',
                                  }}
                                  onMouseEnter={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'rgba(0, 0, 0, 0.05)';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    if (!isSelected) {
                                      e.currentTarget.style.backgroundColor = 'transparent';
                                    }
                                  }}
                                >
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={(e) => {
                                      const currentIds = formData.global_modifier_ids || [];
                                      const newIds = e.target.checked
                                        ? [...currentIds, modifier.id]
                                        : currentIds.filter(id => id !== modifier.id);
                                      setFormData({ ...formData, global_modifier_ids: newIds });
                                    }}
                                    className="w-4 h-4 border rounded focus:ring-2 cursor-pointer"
                                    style={{ 
                                      accentColor: 'var(--color-accent)',
                                      borderColor: 'var(--color-border)',
                                    }}
                                  />
                                  <span className="flex-1 text-sm" style={{ color: 'var(--color-text-main)' }}>
                                    {modifier.name}
                                  </span>
                                  <span className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {modifier.is_free ? (
                                      <span className="font-medium" style={{ color: 'var(--color-success)' }}>Free</span>
                                    ) : (
                                      <span className="font-medium" style={{ color: 'var(--color-accent)' }}>+${parseFloat(modifier.price || 0).toFixed(2)}</span>
                                    )}
                                  </span>
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      {(formData.global_modifier_ids || []).length > 0 && (
                        <p className="text-xs mt-2" style={{ color: 'var(--color-text-muted)' }}>
                          {formData.global_modifier_ids.length} modifier{(formData.global_modifier_ids.length !== 1) ? 's' : ''} selected
                        </p>
                      )}
                    </div>

                    {/* Individual Modifiers Section */}
                    <div className="md:col-span-2 pt-4 mt-4" style={{ borderTop: '1px solid var(--color-border)' }}>
                      <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--color-text-main)' }}>Individual Modifiers</h3>
                      <p className="text-xs mb-4" style={{ color: 'var(--color-text-muted)' }}>
                        Define item-specific modifications. Free modifiers cost nothing, paid modifiers have an additional charge.
                      </p>
                      
                      {/* Free Modifiers */}
                      <div className="mb-4">
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                          Free Modifiers
                        </label>
                        <div className="space-y-2">
                          {(formData.modifiers?.free || []).map((mod, index) => (
                            <div key={index} className="flex gap-2">
                              <input
                                type="text"
                                value={mod.name || ''}
                                onChange={(e) => {
                                  const newModifiers = { ...formData.modifiers };
                                  newModifiers.free[index] = { ...newModifiers.free[index], name: e.target.value };
                                  handleInputChange('modifiers', newModifiers);
                                }}
                                className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                                style={{
                                  borderColor: 'var(--color-border)',
                                  borderRadius: 'var(--input-radius)',
                                  backgroundColor: 'var(--color-surface)',
                                  color: 'var(--color-text-main)',
                                  height: 'var(--input-height)',
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                placeholder="e.g., No onions, Extra pickles"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newModifiers = { ...formData.modifiers };
                                  newModifiers.free = newModifiers.free.filter((_, i) => i !== index);
                                  handleInputChange('modifiers', newModifiers);
                                }}
                                className="px-3 py-2 font-medium rounded-md transition-opacity"
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  color: 'var(--color-danger)',
                                  borderRadius: 'var(--button-radius)',
                                  height: 'var(--input-height)',
                                }}
                                onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.target.style.opacity = '1'}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const newModifiers = { ...formData.modifiers };
                              newModifiers.free = [...(newModifiers.free || []), { name: '' }];
                              handleInputChange('modifiers', newModifiers);
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                            style={{
                              backgroundColor: 'var(--color-background)',
                              color: 'var(--color-text-main)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--button-radius)',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = 'var(--color-surface)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'var(--color-background)';
                            }}
                          >
                            + Add Free Modifier
                          </button>
                        </div>
                      </div>
                      
                      {/* Paid Modifiers */}
                      <div>
                        <label className="block text-sm font-medium mb-2" style={{ color: 'var(--color-text-main)' }}>
                          Paid Modifiers
                        </label>
                        <div className="space-y-2">
                          {(formData.modifiers?.paid || []).map((mod, index) => (
                            <div key={index} className="flex gap-2">
                              <input
                                type="text"
                                value={mod.name || ''}
                                onChange={(e) => {
                                  const newModifiers = { ...formData.modifiers };
                                  newModifiers.paid[index] = { ...newModifiers.paid[index], name: e.target.value };
                                  handleInputChange('modifiers', newModifiers);
                                }}
                                className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                                style={{
                                  borderColor: 'var(--color-border)',
                                  borderRadius: 'var(--input-radius)',
                                  backgroundColor: 'var(--color-surface)',
                                  color: 'var(--color-text-main)',
                                  height: 'var(--input-height)',
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                placeholder="e.g., Extra cheese, Bacon"
                              />
                              <input
                                type="number"
                                step="0.01"
                                min="0"
                                value={mod.price || ''}
                                onChange={(e) => {
                                  const newModifiers = { ...formData.modifiers };
                                  newModifiers.paid[index] = { ...newModifiers.paid[index], price: parseFloat(e.target.value) || 0 };
                                  handleInputChange('modifiers', newModifiers);
                                }}
                                className="w-24 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                                style={{
                                  borderColor: 'var(--color-border)',
                                  borderRadius: 'var(--input-radius)',
                                  backgroundColor: 'var(--color-surface)',
                                  color: 'var(--color-text-main)',
                                  height: 'var(--input-height)',
                                }}
                                onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                                onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                                placeholder="Price"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const newModifiers = { ...formData.modifiers };
                                  newModifiers.paid = newModifiers.paid.filter((_, i) => i !== index);
                                  handleInputChange('modifiers', newModifiers);
                                }}
                                className="px-3 py-2 font-medium rounded-md transition-opacity"
                                style={{
                                  backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                  color: 'var(--color-danger)',
                                  borderRadius: 'var(--button-radius)',
                                  height: 'var(--input-height)',
                                }}
                                onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                onMouseLeave={(e) => e.target.style.opacity = '1'}
                              >
                                Remove
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            onClick={() => {
                              const newModifiers = { ...formData.modifiers };
                              newModifiers.paid = [...(newModifiers.paid || []), { name: '', price: 0 }];
                              handleInputChange('modifiers', newModifiers);
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
                            style={{
                              backgroundColor: 'var(--color-background)',
                              color: 'var(--color-text-main)',
                              border: '1px solid var(--color-border)',
                              borderRadius: 'var(--button-radius)',
                            }}
                            onMouseEnter={(e) => {
                              e.target.style.backgroundColor = 'var(--color-surface)';
                            }}
                            onMouseLeave={(e) => {
                              e.target.style.backgroundColor = 'var(--color-background)';
                            }}
                          >
                            + Add Paid Modifier
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-2 text-white font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onMouseEnter={(e) => {
                        if (!saving) {
                          e.target.style.opacity = '0.9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = '1';
                      }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={resetForm}
                      className="px-4 py-2 font-medium transition-colors"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        color: 'var(--color-text-main)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = 'var(--color-surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = 'var(--color-background)';
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <div className="shadow p-8 text-center" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)', border: '1px solid var(--color-border)' }}>
                  <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>No menu items yet. Add your first item to get started!</p>
                  <button
                    onClick={() => {
                      resetForm();
                      setShowAddForm(true);
                    }}
                    className="px-4 py-2 text-white font-medium transition-opacity"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Add First Item
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {categories.map((category) => (
                    <div key={category} className="shadow overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)', border: '1px solid var(--color-border)' }}>
                      <div className="px-6 py-3" style={{ backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>{category}</h2>
                      </div>
                      <div style={{ borderTop: '1px solid var(--color-border)' }}>
                        {itemsByCategory[category].map((item) => (
                          <div
                            key={item.id}
                            className={`px-6 py-4 transition-colors ${!item.is_available ? 'opacity-60' : ''}`}
                            style={{
                              borderBottom: '1px solid var(--color-border)',
                            }}
                            onMouseEnter={(e) => {
                              if (item.is_available) {
                                e.currentTarget.style.backgroundColor = 'var(--color-background)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold text-sm" style={{ backgroundColor: 'rgba(20, 184, 166, 0.1)', color: 'var(--color-accent)' }}>
                                    #{item.item_number}
                                  </span>
                                  <div>
                                    <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>{item.name}</h3>
                                    {item.description && (
                                      <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{item.description}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>
                                    ${parseFloat(item.price).toFixed(2)}
                                  </div>
                                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {item.is_available ? (
                                      <span style={{ color: 'var(--color-success)' }}>Available</span>
                                    ) : (
                                      <span style={{ color: 'var(--color-danger)' }}>Unavailable</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => toggleAvailability(item)}
                                    className="px-3 py-1 text-xs rounded-md font-medium transition-opacity"
                                    style={{
                                      backgroundColor: item.is_available ? 'rgba(250, 204, 21, 0.1)' : 'rgba(34, 197, 94, 0.1)',
                                      color: item.is_available ? 'var(--color-warning, #f59e0b)' : 'var(--color-success)',
                                      borderRadius: 'var(--button-radius)',
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                                    title={item.is_available ? 'Mark as unavailable' : 'Mark as available'}
                                  >
                                    {item.is_available ? 'Unavailable' : 'Available'}
                                  </button>
                                  <button
                                    onClick={() => handleEdit(item)}
                                    className="px-3 py-1 text-xs font-medium rounded-md transition-opacity"
                                    style={{
                                      backgroundColor: 'rgba(20, 184, 166, 0.1)',
                                      color: 'var(--color-accent)',
                                      borderRadius: 'var(--button-radius)',
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDelete(item.id)}
                                    className="px-3 py-1 text-xs font-medium rounded-md transition-opacity"
                                    style={{
                                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                      color: 'var(--color-danger)',
                                      borderRadius: 'var(--button-radius)',
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Global Modifiers Tab */}
          {activeTab === 'global-modifiers' && (
            <>
              <div className="mb-6 flex justify-between items-center">
                <div>
                  <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>Create reusable modifiers that can be applied to multiple menu items.</p>
                </div>
                <button
                  onClick={() => {
                    resetModifierForm();
                    setShowAddModifierForm(true);
                  }}
                  className="px-4 py-2 text-white font-medium transition-opacity"
                  style={{
                    backgroundColor: 'var(--color-accent)',
                    borderRadius: 'var(--button-radius)',
                    height: 'var(--input-height)',
                  }}
                  onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                  onMouseLeave={(e) => e.target.style.opacity = '1'}
                >
                  + Add Global Modifier
                </button>
              </div>

              {showAddModifierForm && (
                <div 
                  className="mb-6 shadow p-6"
                  style={{
                    backgroundColor: 'var(--color-surface)',
                    borderRadius: 'var(--card-radius)',
                    border: '1px solid var(--color-border)',
                  }}
                >
                  <h2 className="text-xl font-semibold mb-4" style={{ color: 'var(--color-text-main)' }}>
                    {editingModifier ? 'Edit Global Modifier' : 'Add New Global Modifier'}
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Name <span style={{ color: 'var(--color-danger)' }}>*</span>
                      </label>
                      <input
                        type="text"
                        value={modifierFormData.name}
                        onChange={(e) => handleModifierInputChange('name', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="e.g., Extra cheese, No onions"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Category
                      </label>
                      <input
                        type="text"
                        value={modifierFormData.category}
                        onChange={(e) => handleModifierInputChange('category', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="e.g., Toppings, Sauces"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={modifierFormData.price}
                        onChange={(e) => {
                          const price = parseFloat(e.target.value) || 0;
                          handleModifierInputChange('price', e.target.value);
                          handleModifierInputChange('is_free', price === 0);
                        }}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="0.00"
                      />
                      <p className="text-xs mt-1" style={{ color: 'var(--color-text-muted)' }}>Leave as 0 for free modifiers</p>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Display Order
                      </label>
                      <input
                        type="number"
                        value={modifierFormData.display_order}
                        onChange={(e) => handleModifierInputChange('display_order', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                          height: 'var(--input-height)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        placeholder="0"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium mb-1" style={{ color: 'var(--color-text-main)' }}>
                        Description
                      </label>
                      <textarea
                        value={modifierFormData.description}
                        onChange={(e) => handleModifierInputChange('description', e.target.value)}
                        className="w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 transition-colors"
                        style={{
                          borderColor: 'var(--color-border)',
                          borderRadius: 'var(--input-radius)',
                          backgroundColor: 'var(--color-surface)',
                          color: 'var(--color-text-main)',
                        }}
                        onFocus={(e) => e.target.style.borderColor = 'var(--color-accent)'}
                        onBlur={(e) => e.target.style.borderColor = 'var(--color-border)'}
                        rows="2"
                        placeholder="Optional description..."
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={modifierFormData.is_active}
                          onChange={(e) => handleModifierInputChange('is_active', e.target.checked)}
                          className="mr-2"
                          style={{ accentColor: 'var(--color-accent)' }}
                        />
                        <span className="text-sm" style={{ color: 'var(--color-text-main)' }}>Active (available for use)</span>
                      </label>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      onClick={handleSaveModifier}
                      disabled={saving}
                      className="px-4 py-2 text-white font-medium transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: 'var(--color-accent)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onMouseEnter={(e) => {
                        if (!saving) {
                          e.target.style.opacity = '0.9';
                        }
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.opacity = '1';
                      }}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={resetModifierForm}
                      className="px-4 py-2 font-medium transition-colors"
                      style={{
                        backgroundColor: 'var(--color-background)',
                        color: 'var(--color-text-main)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--button-radius)',
                        height: 'var(--input-height)',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.backgroundColor = 'var(--color-surface)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.backgroundColor = 'var(--color-background)';
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {globalModifiers.length === 0 ? (
                <div className="shadow p-8 text-center" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)', border: '1px solid var(--color-border)' }}>
                  <p className="mb-4" style={{ color: 'var(--color-text-muted)' }}>No global modifiers yet. Create your first one to get started!</p>
                  <button
                    onClick={() => {
                      resetModifierForm();
                      setShowAddModifierForm(true);
                    }}
                    className="px-4 py-2 text-white font-medium transition-opacity"
                    style={{
                      backgroundColor: 'var(--color-accent)',
                      borderRadius: 'var(--button-radius)',
                      height: 'var(--input-height)',
                    }}
                    onMouseEnter={(e) => e.target.style.opacity = '0.9'}
                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                  >
                    Add First Modifier
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {modifierCategories.map((category) => (
                    <div key={category} className="shadow overflow-hidden" style={{ backgroundColor: 'var(--color-surface)', borderRadius: 'var(--card-radius)', border: '1px solid var(--color-border)' }}>
                      <div className="px-6 py-3" style={{ backgroundColor: 'var(--color-background)', borderBottom: '1px solid var(--color-border)' }}>
                        <h2 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>{category}</h2>
                      </div>
                      <div style={{ borderTop: '1px solid var(--color-border)' }}>
                        {modifiersByCategory[category].map((modifier) => (
                          <div
                            key={modifier.id}
                            className={`px-6 py-4 transition-colors ${!modifier.is_active ? 'opacity-60' : ''}`}
                            style={{
                              borderBottom: '1px solid var(--color-border)',
                            }}
                            onMouseEnter={(e) => {
                              if (modifier.is_active) {
                                e.currentTarget.style.backgroundColor = 'var(--color-background)';
                              }
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                          >
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-3">
                                  <div>
                                    <h3 className="text-lg font-semibold" style={{ color: 'var(--color-text-main)' }}>
                                      {modifier.name}
                                      {modifier.is_free ? (
                                        <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-success)' }}>(Free)</span>
                                      ) : (
                                        <span className="ml-2 text-sm font-normal" style={{ color: 'var(--color-accent)' }}>
                                          (+${parseFloat(modifier.price || 0).toFixed(2)})
                                        </span>
                                      )}
                                    </h3>
                                    {modifier.description && (
                                      <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>{modifier.description}</p>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-right">
                                  <div className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                                    {modifier.is_active ? (
                                      <span style={{ color: 'var(--color-success)' }}>Active</span>
                                    ) : (
                                      <span style={{ color: 'var(--color-danger)' }}>Inactive</span>
                                    )}
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleEditModifier(modifier)}
                                    className="px-3 py-1 text-xs font-medium rounded-md transition-opacity"
                                    style={{
                                      backgroundColor: 'rgba(20, 184, 166, 0.1)',
                                      color: 'var(--color-accent)',
                                      borderRadius: 'var(--button-radius)',
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handleDeleteModifier(modifier.id)}
                                    className="px-3 py-1 text-xs font-medium rounded-md transition-opacity"
                                    style={{
                                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                      color: 'var(--color-danger)',
                                      borderRadius: 'var(--button-radius)',
                                    }}
                                    onMouseEnter={(e) => e.target.style.opacity = '0.8'}
                                    onMouseLeave={(e) => e.target.style.opacity = '1'}
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </V2AppShell>
    </AuthGuard>
  );
}

export default MenuPage;

