const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');

test('Professional Mode toggle initializes inside the message composer', () => {
  const dom = new JSDOM('<main id="chat-pane"><section id="chat-active-view"><div class="composer"><div class="composer-inner"><textarea id="message-input"></textarea><button id="send-btn"></button></div></div></section></main>', { runScripts: 'outside-only', url: 'http://localhost/' });
  const { window } = dom;
  window.HalonyxMarkdownActions = {};
  const source = fs.readFileSync(require.resolve('../frontend/js/markdown/toolbar.js'), 'utf8');
  vm.runInContext(source, dom.getInternalVMContext());
  window.HalonyxMarkdownToolbar.init();
  const toggle = window.document.getElementById('professional-mode-toggle');
  assert.ok(toggle);
  assert.match(toggle.textContent, /Professional Mode/);
  assert.equal(toggle.closest('.composer') !== null, true);
  assert.ok(window.document.querySelector('.md-composer-shell'));
  assert.ok(window.document.querySelector('.md-toolbar-btn[data-type="bold"]'));
  assert.ok(window.document.querySelector('.md-toolbar-btn[data-type="link"]'));
  assert.doesNotMatch(window.document.querySelector('.md-toolbar').textContent, /btn\.type|btn\.label|btn\.icon/);
  toggle.click();
  assert.equal(window.localStorage.getItem('halonyx.professionalMode'), 'true');
  dom.window.close();
});
