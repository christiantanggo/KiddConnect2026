/** Shared pickup/delivery full address strings for Shipday and DoorDash dispatch. */

export function buildFullAddress(street, city, province, postalCode) {
  const s = street && String(street).trim();
  const c = city && String(city).trim();
  const p = province && String(province).trim();
  const z = postalCode && String(postalCode).trim();
  if (s && (c || p || z)) {
    const rest = [c, [p, z].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    return rest ? `${s}, ${rest}` : s;
  }
  return s || null;
}

export function buildFullPickupAddress(request) {
  return (
    buildFullAddress(
      request.pickup_address,
      request.pickup_city,
      request.pickup_province,
      request.pickup_postal_code
    ) || 'Pickup address TBD'
  );
}

export function buildFullDeliveryAddress(request) {
  return (
    buildFullAddress(
      request.delivery_address,
      request.delivery_city,
      request.delivery_province,
      request.delivery_postal_code
    ) ||
    String(request.delivery_address || '').trim() ||
    'Address TBD'
  );
}

/** @returns {'fr-CA'|'en-US'} */
export function inferDoorDashLocale(request) {
  const prov = String(request?.delivery_province || request?.pickup_province || '').trim().toUpperCase();
  const ca = new Set([
    'ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE', 'NT', 'NU', 'YT',
  ]);
  if (ca.has(prov)) return 'fr-CA';
  return 'en-US';
}
