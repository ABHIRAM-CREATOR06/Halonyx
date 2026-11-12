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

test('renders fenced code as a labeled, numbered, copyable code card', () => {
  const { dom, render } = createRenderer();
  const html = render('```typescript\nconst count = 2;\nreturn count;\n```');
  const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
  assert.equal(doc.querySelector('.code-block-language').textContent, 'typescript');
  assert.equal(doc.querySelector('.code-copy-btn').textContent, 'Copy');
  assert.equal(doc.querySelectorAll('.code-line').length, 2);
  assert.equal(doc.querySelectorAll('.syntax-keyword').length, 2);
  assert.match(doc.querySelector('pre code').textContent, /const count = 2;\nreturn count;/);
  dom.window.close();
});

test('escapes fenced code and treats invalid language labels as plain code', () => {
  const { dom, render } = createRenderer();
  const html = render('```<img src=x onerror=alert(1)>\n<script>alert(1)</script>\n```');
  const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
  assert.equal(doc.querySelector('.code-block-language').textContent, 'code');
  assert.equal(doc.querySelector('img, script, [onerror]'), null);
  assert.equal(doc.querySelector('pre code').textContent, '<script>alert(1)</script>');
  dom.window.close();
});

test('shows an optional filename from fenced-code metadata', () => {
  const { dom, render } = createRenderer();
  const html = render('```c filename=hello.c\nint main(void) {}\n```');
  const doc = new dom.window.DOMParser().parseFromString(html, 'text/html');
  assert.equal(doc.querySelector('.code-block-language').textContent, 'hello.c — c');
  dom.window.close();
});
