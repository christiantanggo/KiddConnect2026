/**
 * Get a delivery quote from Shipday by creating a scheduled order (7 days out),
 * retrieving the order to read costing, then deleting the order.
 * Uses Shipday's Insert Order, Retrieve Order Details, and Delete Order APIs.
 * Order payload matches Shipday dashboard: Order Number, Pick-up From (name, phone, address, time), Deliver to (name, phone, address, date, time), Payment Method, etc.
 */
import { getDeliveryConfigFull } from './config.js';
import { buildShipdayOrderPayload } from './shipdayOrder.js';
import { collectOnDemandEstimates, pickOnDemandEstimate, isCheapestMode } from './shipdayOnDemand.js';

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

/** On-demand API base (DoorDash/Uber etc.). Default: main base + /on-demand. */
export function getShipdayOnDemandBaseUrl(baseUrl) {
  const env = process.env.SHIPDAY_ON_DEMAND_BASE_URL && String(process.env.SHIPDAY_ON_DEMAND_BASE_URL).trim();
  if (env) return env.replace(/\/$/, '');
  if (!baseUrl) return null;
  return `${baseUrl.replace(/\/$/, '')}/on-demand`;
}

/**
 * Attempt to get a quote from Shipday via create → retrieve (costing) → delete.
 * @param {Object} params
 * @param {string} params.pickup_address - Pickup address (required for Shipday quote)
 * @param {string} params.delivery_address - Delivery address (required)
 * @param {string} [params.pickup_phone] - Pick-up from phone (Shipday required); falls back to first delivery line number.
 * @param {string} [params.pickup_name] - Pick-up from name (store name); default "Pickup".
 * @param {string} [params.customer_phone] - Customer/recipient phone
 * @param {string} [params.recipient_name] - Recipient name
 * @param {string} [params.customer_email] - Customer email (optional)
 * @returns {Promise<{ amount_cents: number, source: 'shipday', disclaimer?: string } | null>}
 */
export async function getQuoteFromShipday(params) {
  const { pickup_address, delivery_address, pickup_phone, pickup_name, customer_phone, recipient_name, customer_email } = params || {};
  const pickup = (pickup_address && String(pickup_address).trim()) || null;
  const delivery = (delivery_address && String(delivery_address).trim()) || null;
  if (!pickup || !delivery) return null;

  const { apiKey, baseUrl } = await getShipdayCredentials();
  if (!apiKey) {
    console.log('[ShipdayQuote] Skipping: Shipday not configured (no API key)');
    return null;
  }

  console.log('[ShipdayQuote] Calling Shipday for delivery cost (create → costing → delete)');
  const axios = (await import('axios')).default;
  const orderNumber = `tavari-quote-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const sevenDays = new Date();
  sevenDays.setDate(sevenDays.getDate() + 7);
  const expectedDate = sevenDays.toISOString().slice(0, 10); // YYYY-MM-DD

  const config = await getDeliveryConfigFull();
  const pickupPhone = (pickup_phone && String(pickup_phone).trim()) || (Array.isArray(config?.delivery_phone_numbers) && config.delivery_phone_numbers.length > 0 ? String(config.delivery_phone_numbers[0]).trim() : null);
  const restaurantName = (pickup_name && String(pickup_name).trim()) || 'Pickup';

  const orderPayload = buildShipdayOrderPayload({
    orderNumber,
    customerName: (recipient_name && String(recipient_name).trim()) || 'Quote Customer',
    customerAddress: delivery,
    customerPhoneNumber: (customer_phone && String(customer_phone).trim()) || null,
    customerEmail: customer_email && String(customer_email).trim() ? String(customer_email).trim() : undefined,
    restaurantName,
    restaurantAddress: pickup,
    restaurantPhoneNumber: pickupPhone,
    expectedDeliveryDate: expectedDate,
    expectedPickupTime: '12:00:00',
    expectedDeliveryTime: '13:00:00',
    deliveryFee: 0,
    totalOrderCost: 0,
    paymentMethod: 'credit_card',
  });
  // Omit cost fields so Shipday may calculate and return delivery fee (instead of echoing 0)
  delete orderPayload.deliveryFee;
  delete orderPayload.totalOrderCost;

  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    Authorization: `Basic ${apiKey}`,
  };

  const createUrl = `${baseUrl}/orders`;
  console.log('[ShipdayQuote] POST', createUrl, '→ creating temporary order on Shipday');

  let orderId = null;
  try {
    // 1. Create a scheduled order (7 days out) so it is not dispatched immediately
    const createRes = await axios.post(
      createUrl,
      orderPayload,
      { headers, timeout: 15000, validateStatus: (s) => s < 500 }
    );

    if (createRes.status !== 200 || !createRes.data?.orderId) {
      console.warn('[ShipdayQuote] create order failed', createRes.status, createRes.data);
      return null;
    }
    orderId = createRes.data.orderId;
    console.log('[ShipdayQuote] Shipday responded 200, orderId', orderId, '— order exists on Shipday; retrieving costing...');

    const shipdayConfig = config?.brokers?.shipday;
    const onDemandEnabled = shipdayConfig?.on_demand_enabled === true;
    const preferredProvider = typeof shipdayConfig?.preferred_on_demand_provider === 'string' ? shipdayConfig.preferred_on_demand_provider.trim() : null;

    // If on-demand (DoorDash/Uber) is enabled, get quote from 3rd party estimate API first
    if (onDemandEnabled && preferredProvider) {
      const onDemandBase = getShipdayOnDemandBaseUrl(baseUrl);
      if (onDemandBase) {
        try {
          const authHeaders = { Authorization: headers.Authorization };
          const estimates = await collectOnDemandEstimates(orderId, onDemandBase, authHeaders);
          const match = pickOnDemandEstimate(estimates, preferredProvider);
          const fee = match?.fee != null ? Number(match.fee) : null;
          if (fee != null && fee > 0) {
            const shipday_cost_cents = Math.round(fee * 100);
            const margin_cents = Math.max(0, Math.round(Number(config?.billing?.quote_margin_cents) || 0));
            const total_cents = shipday_cost_cents + margin_cents;
            const label = isCheapestMode(preferredProvider) ? `${match.name} (cheapest)` : (match.name || preferredProvider);
            console.log('[ShipdayQuote] on-demand quote:', label, 'fee', fee, '→ total', total_cents, 'cents');
            return {
              source: 'shipday',
              shipday_cost_cents,
              margin_cents,
              total_cents,
              amount_cents: total_cents,
              disclaimer: `Quote from ${match.name || 'provider'} via Shipday${isCheapestMode(preferredProvider) ? ' (lowest of available estimates)' : ''}. Final cost may vary.`,
              currency: 'CAD',
            };
          }
          console.log('[ShipdayQuote] on-demand: no usable fee from estimates', estimates?.length);
        } catch (onDemandErr) {
          console.warn('[ShipdayQuote] on-demand estimate error', onDemandErr?.message || onDemandErr);
        }
      }
    }

    // 2. Retrieve order details to get costing (Shipday may populate deliveryFee/totalCost; sometimes after a short delay)
    const getUrl = `${baseUrl}/orders/${encodeURIComponent(orderNumber)}`;
    console.log('[ShipdayQuote] GET', getUrl, '→ fetching order from Shipday');
    let getRes = await axios.get(getUrl, {
      headers: { Accept: 'application/json', Authorization: headers.Authorization },
      timeout: 10000,
      validateStatus: (s) => s < 500,
    });

    if (getRes.status !== 200 || !Array.isArray(getRes.data) || getRes.data.length === 0) {
      console.warn('[ShipdayQuote] retrieve order failed', getRes.status, Array.isArray(getRes.data) ? `array length ${getRes.data?.length}` : typeof getRes.data);
      return null;
    }

    let order = getRes.data[0];
    let costing = order?.costing;
    const hasCosting = costing && (Number(costing.totalCost) > 0 || Number(costing.deliveryFee) > 0);
    if (!hasCosting) {
      console.log('[ShipdayQuote] first GET: costing missing or zero', JSON.stringify(costing ?? order?.costing));
      // Shipday may populate costing asynchronously when we omit deliveryFee/totalOrderCost; wait and retry once
      await new Promise((r) => setTimeout(r, 5000));
      getRes = await axios.get(`${baseUrl}/orders/${encodeURIComponent(orderNumber)}`, {
        headers: { Accept: 'application/json', Authorization: headers.Authorization },
        timeout: 10000,
        validateStatus: (s) => s < 500,
      });
      if (getRes.status === 200 && Array.isArray(getRes.data) && getRes.data.length > 0) {
        order = getRes.data[0];
        costing = order?.costing;
        console.log('[ShipdayQuote] after 5s retry: costing', JSON.stringify(costing));
      }
    }

    const deliveryFee = costing?.deliveryFee != null ? Number(costing.deliveryFee) : null;
    const totalCost = costing?.totalCost != null ? Number(costing.totalCost) : null;
    const amount = totalCost != null && totalCost > 0 ? totalCost : (deliveryFee != null && deliveryFee > 0 ? deliveryFee : null);
    const shipday_cost_cents = amount != null ? Math.round(amount * 100) : null;

    if (shipday_cost_cents == null || shipday_cost_cents <= 0) {
      console.log('[ShipdayQuote] no valid costing from Shipday (costing=%s); falling back to config', JSON.stringify(costing));
      return null;
    }

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
