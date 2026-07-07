const { looksLikeRawTable, parseRawTable } = require('./src/cookie-parser');
const fs = require('fs');
const path = require('path');

const rawFile = path.join(__dirname, 'cookies_raw.txt');

// If raw file exists, parse it
if (fs.existsSync(rawFile)) {
  const text = fs.readFileSync(rawFile, 'utf-8');
  console.log(`Raw file: ${text.length} chars`);
  console.log(`Looks like raw table: ${looksLikeRawTable(text)}`);

  if (looksLikeRawTable(text)) {
    const cookies = parseRawTable(text);
    console.log(`\nParsed ${cookies.length} cookies:`);
    cookies.slice(0, 5).forEach((c, i) => {
      console.log(`  [${i}] name="${c.name}" value="${c.value.substring(0, 20)}" domain="${c.domain}" path="${c.path}" secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite}`);
    });
    console.log(`\nAuth cookies:`, cookies.filter(c => ['cookie2', '_tb_token_', '_m_h5_tk', '_nk_'].includes(c.name)).map(c => `${c.name}=${c.value.substring(0, 15)}`));
  }
} else {
  // Test with the user's sample data
  const sample = `3PcFlag	1783260867105	.taobao.com	/	2026-07-15T22:14:21.075Z	20		\u2713	None			Medium	
XSRF-TOKEN	d4fdf22f-b625-4c7a-8064-54c7405f0ed4	pc-growht-rta.taobao.com	/	Session	46	\u2713	\u2713				Medium	
_cc_	VFC%2FuZ9ajQ%3D%3D	.taobao.com	/	2027-07-05T22:14:39.335Z	22		\u2713	None			Medium	
_m_h5_tk	11742bf4fd92fd5b30443e20136caf14_1783270555577	.taobao.com	/	2026-07-05T15:43:49.544Z	54		\u2713	None			Medium	
_m_h5_tk_enc	22c89eb7498df6f7188ebe43e2852887	.taobao.com	/	2026-07-05T15:43:49.544Z	44		\u2713	None			Medium	
_tb_token_	7333b30377163	.taobao.com	/	2026-08-04T14:14:39.335Z	23		\u2713	None			Medium	
cookie2	3c5a0f9bfc0eabc9e2c8e8e3f591fbe1	.taobao.com	/	2027-06-28T14:14:39.335Z	33		\u2713	None		\u2713	Medium`;

  console.log('Testing with sample data...');
  console.log(`Looks like raw table: ${looksLikeRawTable(sample)}`);

  const cookies = parseRawTable(sample);
  console.log(`\nParsed ${cookies.length} cookies:`);
  cookies.forEach((c, i) => {
    console.log(`  [${i}] name="${c.name}" value="${c.value.substring(0, 25)}" domain="${c.domain}" path="${c.path}" secure=${c.secure} httpOnly=${c.httpOnly} sameSite=${c.sameSite}`);
  });
}
