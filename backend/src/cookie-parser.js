/**
 * Parse raw tab-separated cookie data WITHOUT a header row.
 * Columns (observed from actual Chrome copy):
 *   0: Name    1: Value    2: Domain    3: Path    4: Expires
 *   5: Size    6: Secure   7: HttpOnly  8: SameSite
 * Columns after 8 vary by Chrome version (priority, partition key, etc.)
 */
function parseRawTable(text) {
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return [];

  const cookies = [];

  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split('\t');
    if (parts.length < 3) continue;

    const name = parts[0]?.trim();
    const value = parts[1]?.trim() || '';
    const domain = parts[2]?.trim();
    const path = parts[3]?.trim() || '/';
    // parts[4] is expires — we skip it
    // parts[5] is size — we skip it

    if (!name || !domain) continue;

    // Detect Secure/HttpOnly/SameSite
    // Chrome copies checkmarks (✓) or "Secure"/"HttpOnly" text
    const col6 = (parts[6] || '').trim();
    const col7 = (parts[7] || '').trim();
    const col8 = (parts[8] || '').trim();

    const secure = !!col6;
    const httpOnly = !!col7;
    const sameSite = col8 && ['Strict', 'Lax', 'None'].includes(col8) ? col8 : 'Lax';

    cookies.push({
      name,
      value,
      domain,
      path,
      httpOnly,
      secure,
      sameSite: (sameSite.charAt(0).toUpperCase() + sameSite.slice(1).toLowerCase()),
    });
  }

  return cookies;
}

/**
 * Detect if text looks like a raw table (no header).
 * A raw table: first line's col5 (index 5) is a pure number under 1000
 */
function looksLikeRawTable(text) {
  const firstLine = text.split('\n')[0]?.trim();
  if (!firstLine) return false;
  const parts = firstLine.split('\t');
  if (parts.length < 6) return false;

  // Col 0 should look like a cookie name (no spaces, common chars)
  const col0 = parts[0].trim();
  if (/name|名称/i.test(col0)) return false; // Has header
  if (!/^[\w\-_.]+$/.test(col0)) return false;

  // Col 2 should look like a domain
  const col2 = parts[2].trim();
  if (!/\.\w+/.test(col2) && !col2.includes('.')) return false;

  // Col 5 should be a small number (size column)
  const col5 = parseInt(parts[5]?.trim());
  if (isNaN(col5) || col5 > 1000 || col5 < 1) return false;

  return true;
}

module.exports = { looksLikeRawTable, parseRawTable };
