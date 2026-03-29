'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import AuthGuard from '@/components/AuthGuard';
import DashboardHeader from '@/components/DashboardHeader';
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
        <DashboardHeader />
        <div className="container mx-auto px-4 py-8">
          <div className="text-center">Loading...</div>
        </div>
      </AuthGuard>
    );
  }

  return (
    <AuthGuard>
      <DashboardHeader />
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
          <p className="text-gray-600 mt-1">Manage your menu items and global modifiers for takeout orders.</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('items')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'items'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Menu Items
            </button>
            <button
              onClick={() => setActiveTab('global-modifiers')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'global-modifiers'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
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
                <p className="text-gray-600">Items are automatically numbered (#1, #2, etc.) for easy AI recognition.</p>
              </div>
              <button
                onClick={() => {
                  resetForm();
                  setShowAddForm(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                + Add Item
              </button>
            </div>

            {showAddForm && (
              <div className="mb-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-semibold mb-4">
                  {editingItem ? 'Edit Menu Item' : 'Add New Menu Item'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) => handleInputChange('name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Cheeseburger"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Price <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.price}
                      onChange={(e) => handleInputChange('price', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={formData.category}
                      onChange={(e) => handleInputChange('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Main Courses, Appetizers"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Order
                    </label>
                    <input
                      type="number"
                      value={formData.display_order}
                      onChange={(e) => handleInputChange('display_order', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      />
                      <span className="text-sm text-gray-700">Available for ordering</span>
                    </label>
                  </div>
                  
                  {/* Global Modifiers Section */}
                  <div className="md:col-span-2 border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Global Modifiers</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Select global modifiers that apply to this item. These are reusable modifiers you've created.
                    </p>
                    {globalModifiers.length === 0 ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-md p-4 text-center">
                        <p className="text-sm text-gray-600">
                          No global modifiers available. Create them in the "Global Modifiers" tab first.
                        </p>
                      </div>
                    ) : (
                      <div className="border border-gray-300 rounded-md p-4 max-h-64 overflow-y-auto bg-gray-50">
                        <div className="space-y-2">
                          {globalModifiers.map((modifier) => {
                            const isSelected = (formData.global_modifier_ids || []).includes(modifier.id);
                            return (
                              <label
                                key={modifier.id}
                                className="flex items-center gap-3 p-2 rounded-md hover:bg-white cursor-pointer transition-colors"
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
                                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                                />
                                <span className="flex-1 text-sm text-gray-700">
                                  {modifier.name}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {modifier.is_free ? (
                                    <span className="text-green-600 font-medium">Free</span>
                                  ) : (
                                    <span className="text-blue-600 font-medium">+${parseFloat(modifier.price || 0).toFixed(2)}</span>
                                  )}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {(formData.global_modifier_ids || []).length > 0 && (
                      <p className="text-xs text-gray-600 mt-2">
                        {formData.global_modifier_ids.length} modifier{(formData.global_modifier_ids.length !== 1) ? 's' : ''} selected
                      </p>
                    )}
                  </div>

                  {/* Individual Modifiers Section */}
                  <div className="md:col-span-2 border-t pt-4 mt-4">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Individual Modifiers</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Define item-specific modifications. Free modifiers cost nothing, paid modifiers have an additional charge.
                    </p>
                    
                    {/* Free Modifiers */}
                    <div className="mb-4">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
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
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="e.g., No onions, Extra pickles"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newModifiers = { ...formData.modifiers };
                                newModifiers.free = newModifiers.free.filter((_, i) => i !== index);
                                handleInputChange('modifiers', newModifiers);
                              }}
                              className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
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
                          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
                        >
                          + Add Free Modifier
                        </button>
                      </div>
                    </div>
                    
                    {/* Paid Modifiers */}
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
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
                              className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                              className="w-24 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                              placeholder="Price"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const newModifiers = { ...formData.modifiers };
                                newModifiers.paid = newModifiers.paid.filter((_, i) => i !== index);
                                handleInputChange('modifiers', newModifiers);
                              }}
                              className="px-3 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
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
                          className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
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
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={resetForm}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {items.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200 text-center">
                <p className="text-gray-600 mb-4">No menu items yet. Add your first item to get started!</p>
                <button
                  onClick={() => {
                    resetForm();
                    setShowAddForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Add First Item
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {categories.map((category) => (
                  <div key={category} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                      <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {itemsByCategory[category].map((item) => (
                        <div
                          key={item.id}
                          className={`px-6 py-4 hover:bg-gray-50 ${!item.is_available ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <span className="inline-flex items-center justify-center w-8 h-8 bg-blue-100 text-blue-700 rounded-full font-semibold text-sm">
                                  #{item.item_number}
                                </span>
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900">{item.name}</h3>
                                  {item.description && (
                                    <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-lg font-semibold text-gray-900">
                                  ${parseFloat(item.price).toFixed(2)}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {item.is_available ? (
                                    <span className="text-green-600">Available</span>
                                  ) : (
                                    <span className="text-red-600">Unavailable</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => toggleAvailability(item)}
                                  className={`px-3 py-1 text-xs rounded-md font-medium ${
                                    item.is_available
                                      ? 'bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
                                      : 'bg-green-100 text-green-700 hover:bg-green-200'
                                  }`}
                                  title={item.is_available ? 'Mark as unavailable' : 'Mark as available'}
                                >
                                  {item.is_available ? 'Unavailable' : 'Available'}
                                </button>
                                <button
                                  onClick={() => handleEdit(item)}
                                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDelete(item.id)}
                                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium"
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
                <p className="text-gray-600">Create reusable modifiers that can be applied to multiple menu items.</p>
              </div>
              <button
                onClick={() => {
                  resetModifierForm();
                  setShowAddModifierForm(true);
                }}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
              >
                + Add Global Modifier
              </button>
            </div>

            {showAddModifierForm && (
              <div className="mb-6 bg-white p-6 rounded-lg shadow-md border border-gray-200">
                <h2 className="text-xl font-semibold mb-4">
                  {editingModifier ? 'Edit Global Modifier' : 'Add New Global Modifier'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Name <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={modifierFormData.name}
                      onChange={(e) => handleModifierInputChange('name', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Extra cheese, No onions"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Category
                    </label>
                    <input
                      type="text"
                      value={modifierFormData.category}
                      onChange={(e) => handleModifierInputChange('category', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Toppings, Sauces"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
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
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0.00"
                    />
                    <p className="text-xs text-gray-500 mt-1">Leave as 0 for free modifiers</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Display Order
                    </label>
                    <input
                      type="number"
                      value={modifierFormData.display_order}
                      onChange={(e) => handleModifierInputChange('display_order', parseInt(e.target.value) || 0)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={modifierFormData.description}
                      onChange={(e) => handleModifierInputChange('description', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
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
                      />
                      <span className="text-sm text-gray-700">Active (available for use)</span>
                    </label>
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={handleSaveModifier}
                    disabled={saving}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button
                    onClick={resetModifierForm}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 font-medium"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {globalModifiers.length === 0 ? (
              <div className="bg-white p-8 rounded-lg shadow-md border border-gray-200 text-center">
                <p className="text-gray-600 mb-4">No global modifiers yet. Create your first one to get started!</p>
                <button
                  onClick={() => {
                    resetModifierForm();
                    setShowAddModifierForm(true);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 font-medium"
                >
                  Add First Modifier
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {modifierCategories.map((category) => (
                  <div key={category} className="bg-white rounded-lg shadow-md border border-gray-200 overflow-hidden">
                    <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
                      <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                    </div>
                    <div className="divide-y divide-gray-200">
                      {modifiersByCategory[category].map((modifier) => (
                        <div
                          key={modifier.id}
                          className={`px-6 py-4 hover:bg-gray-50 ${!modifier.is_active ? 'opacity-60' : ''}`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <div>
                                  <h3 className="text-lg font-semibold text-gray-900">
                                    {modifier.name}
                                    {modifier.is_free ? (
                                      <span className="ml-2 text-sm font-normal text-green-600">(Free)</span>
                                    ) : (
                                      <span className="ml-2 text-sm font-normal text-blue-600">
                                        (+${parseFloat(modifier.price || 0).toFixed(2)})
                                      </span>
                                    )}
                                  </h3>
                                  {modifier.description && (
                                    <p className="text-sm text-gray-600 mt-1">{modifier.description}</p>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <div className="text-xs text-gray-500">
                                  {modifier.is_active ? (
                                    <span className="text-green-600">Active</span>
                                  ) : (
                                    <span className="text-red-600">Inactive</span>
                                  )}
                                </div>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleEditModifier(modifier)}
                                  className="px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded-md hover:bg-blue-200 font-medium"
                                >
                                  Edit
                                </button>
                                <button
                                  onClick={() => handleDeleteModifier(modifier.id)}
                                  className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded-md hover:bg-red-200 font-medium"
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
    </AuthGuard>
  );
}

export default MenuPage;
