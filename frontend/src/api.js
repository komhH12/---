const API = '/api';

async function fetchJSON(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

export const getStatus  = () => fetchJSON('GET',  `${API}/status`);
export const startLogin = () => fetchJSON('POST', `${API}/login`);
export const search     = (k, m, p)   => fetchJSON('POST', `${API}/search`, { keyword: k,       minFollowers: m, minAvgPrice: p });
export const searchMulti = (kw, m, p) => fetchJSON('POST', `${API}/search`, { keywords: kw,     minFollowers: m, minAvgPrice: p });
export const resumeSearch = ()        => fetchJSON('POST', `${API}/search/resume`);
export const getProgress  = ()        => fetchJSON('GET',  `${API}/search/progress`);
export const stopSearch   = ()        => fetchJSON('POST', `${API}/search/stop`);
