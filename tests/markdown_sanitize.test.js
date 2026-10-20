const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const marked = require('../frontend/js/vendor/marked.min.js');
const createDOMPurify = require('../frontend/js/vendor/purify.min.js');

function createRenderer() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const window = dom.window;
  window.marked = marked;
  window.DOMPurify = createDOMPurify(window);
  const source = fs.readFileSync(require.resolve('../frontend/js/markdown/render.js'), 'utf8');
  vm.runInNewContext(source, { window, globalThis: window });
  return { dom, render: window.HalonyxMarkdownRender.renderMarkdown };
}

test('strips hostile HTML, dangerous links, remote images and unsafe attrs', () => {
  const { dom, render } = createRenderer();
  const html = render([
    '<script>alert(1)</script>',
    '<img src="https://tracker.test/pixel" onerror="alert(1)">',
    '<iframe src="https://attacker.test"></iframe>',
    '<p style="background:url(https://tracker.test)">styled</p>',
    '[js](javascript:alert%281%29) [data](data:text/html,hi) [vb](vbscript:msgbox(1))',
    '![remote](https://tracker.test/pixel.png)'
  ].join('\n\n'));
  const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
  assert.equal(doc.querySelector('script, iframe, img, form, style'), null);
  assert.equal(doc.querySelector('[onerror], [style]'), null);
  const safeLinks = [...doc.querySelectorAll('a[href]')];
  assert.ok(safeLinks.some((link) => link.href.startsWith('https://')));
  for (const link of safeLinks) {
    assert.equal(link.target, '_blank');
    assert.equal(link.rel, 'noopener noreferrer nofollow');
    assert.doesNotMatch(link.getAttribute('href') || '', /^(javascript|data|vbscript):/i);
  }
  assert.match(html, /Image omitted/);
  dom.window.close();
});

test('keeps safe GFM, secure destination visibility and magnet links', () => {
  const { dom, render } = createRenderer();
  const html = render('~~gone~~\n\n| A | B |\n| - | - |\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n\n```js\nconst x = 1;\n```\n\n[label](https://example.test/path)\n\n[shared](magnet:?xt=urn:btih:abc)');
  const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
  assert.ok(doc.querySelector('del'));
  assert.ok(doc.querySelector('table'));
  assert.ok(doc.querySelector('pre code'));
  assert.equal(doc.querySelectorAll('input[disabled]').length, 2);
  assert.match(doc.body.textContent, /https:\/\/example\.test\/path/);
  const magnetLink = doc.querySelector('a[href^="magnet:"]');
  assert.ok(magnetLink);
  assert.equal(magnetLink.target, '_blank');
  assert.equal(magnetLink.rel, 'noopener noreferrer nofollow');
  dom.window.close();
});
