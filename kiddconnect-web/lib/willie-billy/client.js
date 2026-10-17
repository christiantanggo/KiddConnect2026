const API = (process.env.NEXT_PUBLIC_API_URL || 'https://api.lefournier.ca').replace(/\/$/, '');

function headers() {
  const token = document.cookie.split(';').find((c) => c.trim().startsWith('token='))?.split('=')[1];
  const businessId = localStorage.getItem('activeBusinessId') || localStorage.getItem('businessId');
  const out = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  if (businessId) out['X-Active-Business-Id'] = businessId;
  return out;
}

async function request(path, options = {}) {
  const response = await fetch(`${API}/api/v2/willie-billy${path}`, {
    ...options,
    headers: { ...headers(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || 'Willie & Billy request failed');
  }
  return data;
}

export function getWillieSchedule() {
  return request('/schedule');
}

export function saveWillieSchedule(body) {
  return request('/schedule', { method: 'PUT', body: JSON.stringify(body) });
}

export function listWillieRenders(week) {
  const query = week ? `?week=${encodeURIComponent(week)}` : '';
  return request(`/renders${query}`);
}

export function enqueueWillieRender(body) {
  return request('/renders', { method: 'POST', body: JSON.stringify(body) });
}

export function produceWillieToday() {
  return request('/produce-today', { method: 'POST', body: '{}' });
}
