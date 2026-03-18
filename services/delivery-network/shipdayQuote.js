/**
 * Get a delivery quote from Shipday by creating a scheduled order (7 days out),
 * retrieving the order to read costing, then deleting the order.
 * Uses Shipday's Insert Order, Retrieve Order Details, and Delete Order APIs.
 */
import { getDeliveryConfigFull } from './config.js';

/**
 * Get Shipday API key and base URL from config or env.
 */
export async function getShipdayCredentials() {
  const config = await getDeliveryConfigFull();
  const shipday = config?.brokers?.shipday;
  const apiKey =
    (shipday?.enabled && shipday?.api_key) ? shipday.api_key.trim() : null
    || (process.env.DELIVERY_SHIPDAY_API_KEY && String(process.env.DELIVERY_SHIPDAY_API_KEY).trim()) || null;
  const baseUrl =
    (shipday?.base_url && String(shipday.base_url).trim()) || process.env.SHIPDAY_API_BASE_URL || 'https://api.shipday.com';
  return { apiKey, baseUrl: baseUrl.replace(/\/$/, '') };
}

/**
 * Attempt to get a quote from Shipday via create → retrieve (costing) → delete.
 * @param {Object} params
 * @param {string} params.pickup_address - Pickup address (required for Shipday quote)
 * @param {string} params.delivery_address - Delivery address (required)
 * @param {string} [params.customer_phone] - Customer/recipient phone
 * @param {string} [params.recipient_name] - Recipient name
 * @returns {Promise<{ amount_cents: number, source: 'shipday', disclaimer?: string } | null>}
 */
export async function getQuoteFromShipday(params) {
  const { pickup_address, delivery_address, customer_phone, recipient_name } = params || {};
  const pickup = (pickup_address && String(pickup_address).trim()) || null;
  const delivery = (delivery_address && String(delivery_address).trim()) || null;
  if (!pickup || !delivery) return null;

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) return null;

  const axios = (await import('axios')).default;
  const orderNumber = `tavari-quote-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  const expectedDate = sevenDays.toISOString().slice(0, 10); // YYYY-MM-DD
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${apiKey}`,
  };

  let orderId = null;
  try {
    // 1. Create a scheduled order (7 days out) so it is not dispatched immediately
    const createRes = await axios.post(
      `${baseUrl}/orders`,
      {
        orderNumber,
        customerName: (recipient_name && String(recipient_name).trim()) || 'Quote Customer',
        customerAddress: delivery,
        customerPhoneNumber: (customer_phone && String(customer_phone).trim()) || '+10000000000',
        restaurantName: 'Pickup',
        restaurantAddress: pickup,
        expectedDeliveryDate: expectedDate,
        expectedPickupTime: '12:00:00',
        expectedDeliveryTime: '13:00:00',
        deliveryFee: 0,
        totalOrderCost: 0,
      },
      { headers, timeout: 15000, validateStatus: (s) => s < 500 }
    );

    if (createRes.status !== 200 || !createRes.data?.orderId) {
      console.warn('[ShipdayQuote] create order failed', createRes.status, createRes.data);
      return null;
    }
    orderId = createRes.data.orderId;
    console.log('[ShipdayQuote] created order', orderId, 'for quote; retrieving costing...');

    // 2. Retrieve order details to get costing (Shipday may populate deliveryFee/totalCost)
    const getRes = await axios.get(`${baseUrl}/orders/${encodeURIComponent(orderNumber)}`, {
      headers: { Accept: 'application/json', Authorization: headers.Authorization },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });

    if (getRes.status !== 200 || !Array.isArray(getRes.data) || getRes.data.length === 0) {
      console.warn('[ShipdayQuote] retrieve order failed', getRes.status);
      return null;
    }

    const order = getRes.data[0];
    const costing = order?.costing;
    const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
    const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
    const amount = totalCost != null && totalCost > 0 ? totalCost : (deliveryFee != null && deliveryFee > 0 ? deliveryFee : null);
    const shipday_cost_cents = amount != null ? Math.round(amount * 100) : null;

    if (shipday_cost_cents == null || shipday_cost_cents <= 0) {
      console.log('[ShipdayQuote] no costing from Shipday (they may echo what we sent); falling back to config');
      return null;
    }

    const config = await getDeliveryConfigFull();
    const margin_cents = Math.max(0, Math.round(Number(config?.billing?.quote_margin_cents) || 0));
    const total_cents = shipday_cost_cents + margin_cents;

    console.log('[ShipdayQuote] got quote: Shipday', shipday_cost_cents, 'cents, margin', margin_cents, 'cents, total', total_cents);
    return {
      source: 'shipday',
      shipday_cost_cents,
      margin_cents,
      total_cents,
      amount_cents: total_cents,
      disclaimer: 'Quote from Shipday. Final cost may vary.',
      currency: 'CAD',
    };
  } catch (err) {
    console.warn('[ShipdayQuote] error', err?.message || err);
    return null;
  } finally {
    // 3. Cancel/delete the temporary order in Shipday so it never gets dispatched
    if (orderId != null) {
      try {
        await axios.delete(`${baseUrl}/orders/${orderId}`, {
          headers: { Authorization: headers.Authorization },
          timeout: 5000,
          validateStatus: (s) => s === 204 || s === 200,
        });
        console.log('[ShipdayQuote] Pickup cancelled: temporary quote order', orderId, 'deleted from Shipday');
      } catch (delErr) {
        console.warn('[ShipdayQuote] Failed to cancel quote order', orderId, delErr?.message || delErr);
      }
    }
  }
}
