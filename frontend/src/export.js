const fmt = n => n >= 1e4 ? (n / 1e4).toFixed(n >= 1e5 ? 0 : 1) + '万' : n.toLocaleString();

function buildExportHTML(results, searchedKw, minFans) {
  const now = new Date().toLocaleString('zh-CN');
  const rows = results
    .map((s, i) => `<tr>
      <td>${i + 1}</td>
      <td>${escapeHtml(s.shopName)}</td>
      <td>${fmt(s.followers)}</td>
      <td>${s.categoryLabel || '综合'}</td>
      <td>${escapeHtml(s.url)}</td>
    </tr>`)
    .join('');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><title>淘宝店铺查询结果</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, 'Microsoft YaHei', sans-serif; padding: 40px; color: #333; }
  h1 { font-size: 22px; margin-bottom: 8px; }
  .meta { font-size: 13px; color: #999; margin-bottom: 28px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f5f5f5; text-align: left; padding: 10px 12px; font-weight: 600; font-size: 11px; text-transform: uppercase; color: #666; border-bottom: 2px solid #e5e5e5; }
  td { padding: 10px 12px; border-bottom: 1px solid #eee; }
  tr:nth-child(even) td { background: #fafafa; }
  .rank { text-align: center; width: 50px; }
  .fans { text-align: right; color: #f50; font-weight: 600; width: 90px; }
  .url { color: #999; font-size: 11px; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .footer { margin-top: 30px; font-size: 11px; color: #ccc; text-align: center; }
  @media print {
    body { padding: 20px; }
    .footer { position: fixed; bottom: 20px; width: 100%; }
  }
</style></head>
<body>
  <h1>淘宝高粉店铺查询结果</h1>
  <p class="meta">关键词: ${escapeHtml(searchedKw)} · 最低粉丝: ${fmt(minFans)} · 结果数: ${results.length} · 导出时间: ${now}</p>
  <table>
    <thead><tr><th class="rank">#</th><th>店铺名称</th><th class="fans">粉丝数</th><th>品类</th><th>店铺链接</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="footer">数据来源: 淘宝网 · 仅供内部参考</p>
</body></html>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Export results as Word (.docx) — uses HTML wrapped in Word XML via Blob.
 */
export function exportWord(results, searchedKw, minFans) {
  const html = buildExportHTML(results, searchedKw, minFans);
  const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `淘宝店铺查询_${searchedKw}_${new Date().toISOString().slice(0, 10)}.doc`;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Export results as PDF — opens browser print dialog with print-optimized layout.
 */
export function exportPDF(results, searchedKw, minFans) {
  const html = buildExportHTML(results, searchedKw, minFans);
  const w = window.open('', '_blank', 'width=900,height=700');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    w.print();
    // Don't close immediately — user may want to save as PDF from print dialog
  };
}
