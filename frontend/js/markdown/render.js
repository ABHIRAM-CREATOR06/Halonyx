(function (root) {
  'use strict';
  var MAX_MARKDOWN_LENGTH = 10000;
  var allowedTags = ['a','p','br','strong','em','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','input','span'];
  var allowedAttrs = ['href','target','rel','title','type','checked','disabled'];
  var linkHookInstalled = false;
  function escapeAttr(value) {
    return String(value || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function renderMarkdown(text) {
    if (typeof text !== 'string') text = String(text == null ? '' : text);
    if (text.length > MAX_MARKDOWN_LENGTH) throw new RangeError('Markdown message exceeds 10000 characters');
    if (!root.marked || !root.DOMPurify) throw new Error('Markdown dependencies unavailable');
    if (!linkHookInstalled && root.DOMPurify.addHook) {
      root.DOMPurify.addHook('afterSanitizeAttributes', function (node) {
        if (node.nodeName === 'A' && node.hasAttribute('href')) {
          node.setAttribute('target', '_blank');
          node.setAttribute('rel', 'noopener noreferrer nofollow');
        }
      });
      linkHookInstalled = true;
    }
    var renderer = new root.marked.Renderer();
    renderer.html = function (token) { return escapeAttr(token.text || ''); };
    renderer.link = function (token) {
      var href = token.href || '';
      var label = this.parser.parseInline(token.tokens);
      var visibleDestination = label.replace(/<[^>]*>/g, '') === href ? '' : ' <span>(' + escapeAttr(href) + ')</span>';
      return '<a href="' + escapeAttr(href) + '" target="_blank" rel="noopener noreferrer nofollow">' + label + '</a>' + visibleDestination;
    };
    renderer.image = function (token) {
      var href = token.href || '';
      return '<a href="' + escapeAttr(href) + '" target="_blank" rel="noopener noreferrer nofollow">[Image omitted: ' + escapeAttr(token.text || href) + '] (' + escapeAttr(href) + ')</a>';
    };
    var html = root.marked.parse(text, { gfm: true, breaks: false, renderer: renderer });
    var clean = root.DOMPurify.sanitize(html, {
      ALLOWED_TAGS: allowedTags,
      ALLOWED_ATTR: allowedAttrs,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|magnet):|#|\/|\.\.?\/)/i,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
      FORBID_TAGS: ['img','script','style','iframe','form','svg','math','video','audio','object','embed'],
      FORBID_ATTR: ['style'],
      SANITIZE_DOM: true
    });
    return clean;
  }
  root.HalonyxMarkdownRender = { renderMarkdown: renderMarkdown, MAX_MARKDOWN_LENGTH: MAX_MARKDOWN_LENGTH };
})(typeof window !== 'undefined' ? window : globalThis);
