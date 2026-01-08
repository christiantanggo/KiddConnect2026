import { supabaseClient } from '../config/database.js';

export class TakeoutOrder {
  /**
   * Generate next order number (e.g., TO-2026-001)
   */
  static async generateOrderNumber(businessId) {
    const currentYear = new Date().getFullYear();
    const prefix = `TO-${currentYear}-`;
    
    // Get the latest order number for this business this year
    const { data: latestOrder, error } = await supabaseClient
      .from('takeout_orders')
      .select('order_number')
      .eq('business_id', businessId)
      .like('order_number', `${prefix}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
      console.error('[TakeoutOrder] Error fetching latest order:', error);
      // Fallback to current timestamp if query fails
      return `${prefix}${Date.now().toString().slice(-6)}`;
    }
    
    if (!latestOrder) {
      return `${prefix}001`;
    }
    
    // Extract the number part and increment
    const latestNumber = parseInt(latestOrder.order_number.replace(prefix, ''), 10);
    const nextNumber = (latestNumber + 1).toString().padStart(3, '0');
    
    return `${prefix}${nextNumber}`;
  }

  /**
   * Create a new takeout order
   */
  static async create(data) {
    const {
      business_id,
      call_session_id,
      vapi_call_id,
      customer_name,
      customer_phone,
      customer_email,
      order_type = 'takeout',
      status = 'pending',
      special_instructions,
      subtotal = 0,
      tax = 0,
      total = 0,
      items = [], // Array of order items
    } = data;
    
    // Generate order number
    const order_number = await this.generateOrderNumber(business_id);
    
    // Create the order
    const { data: order, error: orderError } = await supabaseClient
      .from('takeout_orders')
      .insert({
        business_id,
        call_session_id,
        vapi_call_id,
        customer_name,
        customer_phone,
        customer_email,
        order_number,
        order_type,
        status,
        special_instructions,
        subtotal,
        tax,
        total,
        confirmed_at: status === 'confirmed' ? new Date().toISOString() : null,
      })
      .select()
      .single();
    
    if (orderError) {
      console.error('[TakeoutOrder] Error creating order:', orderError);
      throw orderError;
    }
    
    // Create order items if provided
    if (items && items.length > 0) {
      const orderItems = items.map(item => {
        const itemData = {
          order_id: order.id,
          menu_item_id: item.menu_item_id || null,
          item_name: item.name || item.item_name,
          item_description: item.description || item.item_description || null,
          quantity: item.quantity || 1,
          unit_price: item.unit_price || item.price || 0,
          item_total: (item.quantity || 1) * (item.unit_price || item.price || 0),
          modifications: item.modifications || null,
          special_instructions: item.special_instructions || null,
        };
        
        // Only include item_number if it's a valid number (column may not exist in schema)
        if (item.item_number !== null && item.item_number !== undefined) {
          itemData.item_number = item.item_number;
        }
        
        return itemData;
      });
      
      const { error: itemsError } = await supabaseClient
        .from('takeout_order_items')
        .insert(orderItems);
      
      if (itemsError) {
        console.error('[TakeoutOrder] Error creating order items:', itemsError);
        
        // If error is about missing column, try without item_number
        if (itemsError.code === 'PGRST204' && itemsError.message?.includes('item_number')) {
          console.warn('[TakeoutOrder] item_number column not found, retrying without it...');
          const itemsWithoutItemNumber = orderItems.map(item => {
            const { item_number, ...rest } = item;
            return rest;
          });
          
          const { error: retryError } = await supabaseClient
            .from('takeout_order_items')
            .insert(itemsWithoutItemNumber);
          
          if (retryError) {
            console.error('[TakeoutOrder] Error creating order items (retry):', retryError);
            throw retryError;
          } else {
            console.log('[TakeoutOrder] Order items created successfully without item_number column');
          }
        } else {
          // Other error - throw it
          throw itemsError;
        }
      }
    }
    
    // Fetch the complete order with items
    return await this.findById(order.id);
  }

  /**
   * Find order by ID with items
   */
  static async findById(orderId) {
    const { data: order, error } = await supabaseClient
      .from('takeout_orders')
      .select('*')
      .eq('id', orderId)
      .is('deleted_at', null)
      .single();
    
    if (error) throw error;
    if (!order) return null;
    
    // Fetch items
    const { data: items, error: itemsError } = await supabaseClient
      .from('takeout_order_items')
      .select('*')
      .eq('order_id', orderId)
      .order('created_at', { ascending: true });
    
    if (itemsError) {
      console.error('[TakeoutOrder] Error fetching items:', itemsError);
      order.items = [];
    } else {
      order.items = items || [];
    }
    
    return order;
  }

  /**
   * Find orders by business ID
   */
  static async findByBusinessId(businessId, options = {}) {
    const {
      status,
      limit = 100,
      offset = 0,
      orderBy = 'created_at',
      orderDirection = 'desc',
    } = options;
    
    let query = supabaseClient
      .from('takeout_orders')
      .select('*')
      .eq('business_id', businessId)
      .is('deleted_at', null)
      .order(orderBy, { ascending: orderDirection === 'asc' })
      .range(offset, offset + limit - 1);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: orders, error } = await query;
    
    if (error) throw error;
    
    // Fetch items for each order
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: allItems, error: itemsError } = await supabaseClient
        .from('takeout_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });
      
      if (!itemsError && allItems) {
        // Group items by order_id
        const itemsByOrderId = {};
        allItems.forEach(item => {
          if (!itemsByOrderId[item.order_id]) {
            itemsByOrderId[item.order_id] = [];
          }
          itemsByOrderId[item.order_id].push(item);
        });
        
        // Attach items to orders
        orders.forEach(order => {
          order.items = itemsByOrderId[order.id] || [];
        });
      }
    }
    
    return orders || [];
  }

  /**
   * Update order status
   */
  static async updateStatus(orderId, status, options = {}) {
    const updateData = {
      status,
      updated_at: new Date().toISOString(),
    };
    
    // Set timestamp based on status
    const now = new Date().toISOString();
    switch (status) {
      case 'confirmed':
        updateData.confirmed_at = updateData.confirmed_at || now;
        break;
      case 'preparing':
        updateData.started_preparing_at = updateData.started_preparing_at || now;
        break;
      case 'ready':
        updateData.ready_at = updateData.ready_at || now;
        break;
      case 'completed':
        updateData.completed_at = updateData.completed_at || now;
        break;
    }
    
    // Allow overriding estimated_ready_time
    if (options.estimated_ready_time) {
      updateData.estimated_ready_time = options.estimated_ready_time;
    }
    
    const { data: order, error } = await supabaseClient
      .from('takeout_orders')
      .update(updateData)
      .eq('id', orderId)
      .select()
      .single();
    
    if (error) throw error;
    
    // Fetch with items
    return await this.findById(orderId);
  }

  /**
   * Get pending/active orders for kitchen display
   */
  static async getActiveOrders(businessId) {
    const { data: orders, error } = await supabaseClient
      .from('takeout_orders')
      .select('*')
      .eq('business_id', businessId)
      .in('status', ['pending', 'confirmed', 'preparing', 'ready']) // Include 'ready' status
      .is('deleted_at', null)
      .order('created_at', { ascending: true }); // Oldest first for kitchen
    
    if (error) throw error;
    
    // Fetch items for all orders
    if (orders && orders.length > 0) {
      const orderIds = orders.map(o => o.id);
      const { data: allItems, error: itemsError } = await supabaseClient
        .from('takeout_order_items')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: true });
      
      if (!itemsError && allItems) {
        const itemsByOrderId = {};
        allItems.forEach(item => {
          if (!itemsByOrderId[item.order_id]) {
            itemsByOrderId[item.order_id] = [];
          }
          itemsByOrderId[item.order_id].push(item);
        });
        
        orders.forEach(order => {
          order.items = itemsByOrderId[order.id] || [];
        });
      }
    }
    
    return orders || [];
  }
}

