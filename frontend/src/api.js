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
export const search     = (k, m)   => fetchJSON('POST', `${API}/search`, { keyword: k,       minFollowers: m });
export const searchMulti = (kw, m) => fetchJSON('POST', `${API}/search`, { keywords: kw,     minFollowers: m });
export const resumeSearch = ()     => fetchJSON('POST', `${API}/search/resume`);
export const getProgress  = ()     => fetchJSON('GET',  `${API}/search/progress`);
