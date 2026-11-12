(function (root) {
  'use strict';
  var MAX_MARKDOWN_LENGTH = 10000;
  var allowedTags = ['a','p','br','strong','em','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','table','thead','tbody','tr','th','td','input','span','div','button'];
  var allowedAttrs = ['href','target','rel','title','type','checked','disabled','class'];
  var linkHookInstalled = false;
  function escapeAttr(value) {
    return String(value || '').replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function highlightLine(line) {
    var pattern = /(\/\/.*|#.*|\/\*.*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b(?:const|let|var|function|return|if|else|for|while|class|new|async|await|export|import|from|default|true|false|null|undefined|def|print|public|private|static|void|int|string|boolean)\b)|(\b\d+(?:\.\d+)?\b)/g;
    var output = '';
    var last = 0;
    var match;
    while ((match = pattern.exec(line))) {
      output += escapeAttr(line.slice(last, match.index));
      var kind = match[1] ? 'comment' : match[2] ? 'string' : match[3] ? 'keyword' : 'number';
      output += '<span class="syntax-' + kind + '">' + escapeAttr(match[0]) + '</span>';
      last = match.index + match[0].length;
    }
    return output + escapeAttr(line.slice(last));
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
    renderer.code = function (token) {
      var info = String(token.lang || 'code');
      var language = info.split(/[\s,]/)[0].toLowerCase();
      if (!/^[a-z0-9+#.-]{1,24}$/.test(language)) language = 'code';
      var filenameMatch = info.match(/(?:filename|title)=["']?([^\s"']+)["']?/i);
      var heading = filenameMatch ? escapeAttr(filenameMatch[1]) + ' — ' + escapeAttr(language) : escapeAttr(language);
      var lines = String(token.text || '').split('\n');
      var numbered = lines.map(function (line) { return '<span class="code-line">' + highlightLine(line) + '</span>'; }).join('\n');
      return '<div class="code-block-card"><div class="code-block-header"><span class="code-block-language">' + heading + '</span><button type="button" class="code-copy-btn" title="Copy code">Copy</button></div><pre><code>' + numbered + '</code></pre></div>\n';
    };
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
