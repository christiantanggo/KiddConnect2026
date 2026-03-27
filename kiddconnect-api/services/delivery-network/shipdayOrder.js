/**
 * Build the request body for Shipday Insert Order API.
 * Matches Shipday dashboard: Order Number, Pick-up From (name, phone, address, time), Deliver to (name, phone, email, address, date, time), Order Details (payment, fees, etc.).
 * @see https://docs.shipday.com/reference/insert-delivery-order
 */
import { normalizePhone } from './config.js';

/**
 * Build payload for POST /orders. All required fields per Shipday API and dashboard are set.
 * @param {Object} opts
 * @param {string} opts.orderNumber - Required. Alphanumeric order reference.
 * @param {string} opts.customerName - Deliver to: name (required).
 * @param {string} opts.customerAddress - Deliver to: address (required).
 * @param {string} opts.customerPhoneNumber - Deliver to: phone (required, with country code).
 * @param {string} [opts.customerEmail] - Deliver to: email (optional).
 * @param {string} opts.restaurantName - Pick-up from: name (required).
 * @param {string} opts.restaurantAddress - Pick-up from: address (required).
 * @param {string} opts.restaurantPhoneNumber - Pick-up from: phone (required).
 * @param {string} opts.expectedDeliveryDate - YYYY-MM-DD.
 * @param {string} opts.expectedPickupTime - HH:mm:ss.
 * @param {string} opts.expectedDeliveryTime - HH:mm:ss.
 * @param {number} [opts.deliveryFee=0]
 * @param {number} [opts.totalOrderCost=0]
 * @param {string} [opts.paymentMethod='credit_card'] - 'cash' | 'credit_card' (required by Shipday dashboard).
 * @param {string} [opts.deliveryInstruction]
 * @param {string} [opts.pickupInstruction]
 * @param {number} [opts.tips]
 * @param {number} [opts.tax]
 * @param {number} [opts.discountAmount]
 * @param {Array} [opts.orderItem] - Array of { name, quantity, unitPrice?, addOns?, detail? }
 */
export function buildShipdayOrderPayload(opts) {
  const {
    orderNumber,
    customerName,
    customerAddress,
    customerPhoneNumber,
    customerEmail,
    restaurantName,
    restaurantAddress,
    restaurantPhoneNumber,
    expectedDeliveryDate,
    expectedPickupTime,
    expectedDeliveryTime,
    deliveryFee = 0,
    totalOrderCost = 0,
    paymentMethod = 'credit_card',
    deliveryInstruction,
    pickupInstruction,
    tips,
    tax,
    discountAmount,
    orderItem,
  } = opts;

  const phone = (v) => (v && normalizePhone(String(v).trim())) || null;
  const str = (v, def) => (v != null && String(v).trim() !== '') ? String(v).trim() : def;

  const payload = {
    orderNumber: str(orderNumber, ''),
    customerName: str(customerName, 'Customer'),
    customerAddress: str(customerAddress, ''),
    customerPhoneNumber: phone(customerPhoneNumber) || '+10000000000',
    restaurantName: str(restaurantName, 'Pickup'),
    restaurantAddress: str(restaurantAddress, ''),
    restaurantPhoneNumber: phone(restaurantPhoneNumber) || '+10000000001',
    expectedDeliveryDate: str(expectedDeliveryDate, ''),
    expectedPickupTime: str(expectedPickupTime, '12:00:00'),
    expectedDeliveryTime: str(expectedDeliveryTime, '13:00:00'),
    deliveryFee: Number(deliveryFee) || 0,
    totalOrderCost: Number(totalOrderCost) || 0,
    paymentMethod: paymentMethod === 'cash' ? 'cash' : 'credit_card',
  };

  if (customerEmail != null && String(customerEmail).trim()) payload.customerEmail = String(customerEmail).trim();
  if (deliveryInstruction != null && String(deliveryInstruction).trim()) payload.deliveryInstruction = String(deliveryInstruction).trim();
  if (pickupInstruction != null && String(pickupInstruction).trim()) payload.pickupInstruction = String(pickupInstruction).trim();
  if (tips != null && Number(tips) >= 0) payload.tips = Number(tips);
  if (tax != null && Number(tax) >= 0) payload.tax = Number(tax);
  if (discountAmount != null && Number(discountAmount) >= 0) payload.discountAmount = Number(discountAmount);
  if (Array.isArray(orderItem) && orderItem.length > 0) payload.orderItem = orderItem;

  return payload;
}
