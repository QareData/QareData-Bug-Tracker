import assert from 'assert';
import * as wrap from '../src/services/pdf-wrapping.js';

function run() {
  // Long word
  const longWord = 'A'.repeat(200);
  const n1 = wrap.normalizePdfText(longWord);
  assert.strictEqual(n1.length, 200, 'normalize should preserve long sequence');

  // URL
  const url = 'https://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.com/path/to/resource?query=1#frag';
  const n2 = wrap.normalizePdfText(url);
  assert(n2.includes('https://'), 'url should be preserved');

  // Emoji & unicode
  const s3 = 'Élévation 🚀 漢字 العربية';
  const n3 = wrap.normalizePdfText(s3);
  assert(n3.includes('🚀') && n3.includes('漢字') && n3.includes('العربية'), 'unicode should be preserved');

  // Filename sanitization
  const fname = 'weird<>:"/\\|?*name  .png';
  const fclean = wrap.sanitizeFilenameForPdf(fname);
  assert(!/[<>:\"/\\|?*]/.test(fclean), 'should remove illegal filename chars');

  // Truncate caption
  const longName = 'x'.repeat(200) + '.png';
  const cap = wrap.truncateCaption(longName, 40);
  assert(cap.length <= 41, 'caption should be truncated with ellipsis');

  console.log('All wrapping tests passed');
}

run();
