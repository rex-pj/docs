/**
 * common.js — AZ-204 Visual Enhancer
 *
 * 1. Syntax highlighting via highlight.js (CDN, github-dark theme)
 * 2. .diagram text (→ bullets) → card grid
 * 3. .diagram with ASCII art → monospace <pre> block
 * 4. <ul> with strong-prefix items → feature card grid
 * 5. Plain <ul> → styled checklist
 * 6. Nested <ul> inside <li> → indented checklist
 * 7. <table> → add scroll wrapper + zebra improvements
 */
(function () {
  'use strict';

  /* ─── Containers where we leave lists untouched ─── */
  var SKIP_PARENTS = [
    '.note', '.dg-cards', '.feat-cards', '.check-list',
    '.tier-ladder', '.flow-steps', '.compare-2', '.arch-grid',
    '.cmp-col', '.cmp-step', 'nav', '.pnav', '#cnav', '#toc',
    '.toc-list', '.card', '.arch-card', '.dg-card', '.summary-card',
  ].join(',');

  /* ════════════════════════════════════════════════════
     1. SYNTAX HIGHLIGHTING
  ════════════════════════════════════════════════════ */
  var LANG = {
    'python':'python','py':'python',
    'c#':'csharp','csharp':'csharp','.net':'csharp','dotnet':'csharp','asp.net':'csharp',
    'javascript':'javascript','js':'javascript','node.js':'javascript','node':'javascript',
    'typescript':'typescript','ts':'typescript',
    'json':'json','json5':'json',
    'xml':'xml','html':'xml',
    'bash':'bash','shell':'bash','sh':'bash','zsh':'bash','cmd':'bash',
    'cli':'bash','azure cli':'bash',
    'powershell':'powershell','ps1':'powershell','ps':'powershell',
    'sql':'sql','t-sql':'sql',
    'java':'java',
    'http':'http','rest':'http',
    'rust':'rust',
    'go':'go',
    'yaml':'yaml','yml':'yaml',
    'dockerfile':'dockerfile',
    'bicep':'bicep','terraform':'hcl','hcl':'hcl',
    'code':'plaintext','text':'plaintext','plaintext':'plaintext','output':'plaintext',
  };

  function applyHighlighting() {
    document.querySelectorAll('.cb').forEach(function (cb) {
      var langEl = cb.querySelector('.cb-lang');
      var pre = cb.querySelector('pre');
      if (!pre || pre.querySelector('code.hljs')) return;
      var rawLang = langEl ? langEl.textContent.trim().toLowerCase() : '';
      var lang = LANG[rawLang] || 'plaintext';

      /* If pre already has a <code> child, use it directly (avoid double-wrap) */
      var existingCode = pre.querySelector('code');
      if (existingCode) {
        /* Keep author-specified language class; fall back to cb-lang mapping */
        if (!existingCode.className || !/\blanguage-\w/.test(existingCode.className)) {
          existingCode.className = 'language-' + lang;
        }
        if (window.hljs) window.hljs.highlightElement(existingCode);
        return;
      }

      /* Pre has raw text content — wrap in <code> */
      var code = document.createElement('code');
      code.className = 'language-' + lang;
      code.textContent = pre.textContent;
      pre.innerHTML = '';
      pre.appendChild(code);
      if (window.hljs) window.hljs.highlightElement(code);
    });
  }

  function loadHighlightJS() {
    var css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'hljs/github-dark.min.css';
    document.head.appendChild(css);
    var js = document.createElement('script');
    js.src = 'hljs/highlight.min.js';
    js.onload = applyHighlighting;
    document.head.appendChild(js);
  }

  /* ════════════════════════════════════════════════════
     2. DIAGRAM TEXT → CARD GRID  /  TITLED PRE  /  SUMMARY CARD
  ════════════════════════════════════════════════════ */

  /* Strip common leading whitespace from all non-empty lines */
  function dedent(text) {
    var lines = text.split('\n');
    /* Remove leading/trailing blank lines */
    while (lines.length && !lines[0].trim()) lines.shift();
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    var min = Infinity;
    lines.forEach(function (l) {
      if (l.trim()) {
        var m = l.match(/^(\s*)/);
        if (m) min = Math.min(min, m[1].length);
      }
    });
    if (min === Infinity) min = 0;
    return lines.map(function (l) { return l.slice(min); }).join('\n');
  }

  /* ── Extract a box title from the top of diagram text ──
     Handles:
       ┌─────┐          ┌─────┐
       │TITLE│    and   │TITLE│
       └─────┘          ├─────┤  (content follows)
  ── */
  function extractDiagramTitle(lines) {
    var start = 0;
    while (start < lines.length && !lines[start].trim()) start++;
    if (start + 2 >= lines.length) return null;
    var l0 = lines[start].trim();
    var l1 = lines[start + 1].trim();
    var l2 = lines[start + 2].trim();
    if (l0.charAt(0) === '┌' && l1.charAt(0) === '│' &&
        (l2.charAt(0) === '└' || l2.charAt(0) === '├')) {
      var title = l1.replace(/^│/, '').replace(/│$/, '').trim();
      /* For └ case: strip all 3 lines. For ├ case: keep the ├ line as body header */
      var stripCount = l2.charAt(0) === '└' ? 3 : 2;
      var body = lines.slice(0, start).concat(lines.slice(start + stripCount));
      return { title: title, bodyLines: body };
    }
    return null;
  }

  /* ── Detect a "TÓM TẮT" summary block ── */
  function isSummaryDiagram(text) {
    return /━{4,}/.test(text) &&
           (/✅/.test(text) || /^[^\n•✅]+:\s*$/m.test(text)) &&
           /^[^\n]+:\s*$/m.test(text);
  }

  /* ── Convert summary diagram to .summary-card ── */
  function convertDiagramToSummary(el, text) {
    var lines = dedent(text).split('\n');
    var title = '';
    var bodyStart = 0;
    for (var i = 0; i < lines.length; i++) {
      var t = lines[i].trim();
      if (!t || /^━+$/.test(t)) { bodyStart = i + 1; continue; }
      if (!title) { title = t; bodyStart = i + 1; break; }
    }

    var sections = [];
    var cur = null;
    for (var j = bodyStart; j < lines.length; j++) {
      var trimmed = lines[j].trim();
      if (!trimmed) continue;
      /* Section header: ends with ":" and is reasonably title-like */
      if (/^[^\n✅•·]{3,}:\s*$/.test(trimmed)) {
        cur = { hd: trimmed.replace(/:$/, '').trim(), items: [] };
        sections.push(cur);
      } else if (/^✅/.test(trimmed)) {
        if (!cur) { cur = { hd: '', items: [] }; sections.push(cur); }
        cur.items.push(trimmed.replace(/^✅\s*/, ''));
      } else if (/^[•·]/.test(trimmed)) {
        if (cur) cur.items.push(trimmed.replace(/^[•·]\s*/, ''));
      }
    }

    var card = document.createElement('div');
    card.className = 'summary-card';
    if (title) {
      var hd = document.createElement('div');
      hd.className = 'summary-card-hd';
      hd.textContent = title;
      card.appendChild(hd);
    }
    var body = document.createElement('div');
    body.className = 'summary-card-body';
    sections.forEach(function (s) {
      if (!s.items.length) return;
      var sec = document.createElement('div');
      sec.className = 'sum-section';
      if (s.hd) {
        var sh = document.createElement('div');
        sh.className = 'sum-section-hd';
        sh.textContent = s.hd;
        sec.appendChild(sh);
      }
      var ul = document.createElement('ul');
      ul.className = 'sum-items';
      s.items.forEach(function (item) {
        var li = document.createElement('li');
        li.textContent = item;
        ul.appendChild(li);
      });
      sec.appendChild(ul);
      body.appendChild(sec);
    });
    card.appendChild(body);
    el.innerHTML = '';
    el.appendChild(card);
    el.classList.add('dg-converted');
  }

  function convertDiagramToCards(el, text) {
    var lines = text.split('\n');
    var groups = [], cur = null;
    lines.forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (/^[→➜]/.test(t) || /^->/.test(t)) {
        if (!cur) { cur = { title: '', bullets: [] }; groups.push(cur); }
        cur.bullets.push(t.replace(/^[→➜]\s*|^->\s*/, ''));
      } else {
        cur = { title: t, bullets: [] };
        groups.push(cur);
      }
    });

    var hasContent = groups.some(function (g) { return g.bullets.length > 0; });
    if (!hasContent || groups.length < 2) return false;

    var wrap = document.createElement('div');
    wrap.className = 'dg-cards';
    groups.forEach(function (g) {
      if (!g.title && !g.bullets.length) return;
      var card = document.createElement('div');
      card.className = 'dg-card';
      if (g.title) {
        var h = document.createElement('div');
        h.className = 'dg-card-title';
        h.textContent = g.title;
        card.appendChild(h);
      }
      if (g.bullets.length) {
        var ul = document.createElement('ul');
        g.bullets.forEach(function (b) {
          var li = document.createElement('li');
          li.textContent = b;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      wrap.appendChild(card);
    });

    el.innerHTML = '';
    el.appendChild(wrap);
    el.classList.add('dg-converted');
    return true;
  }

  function convertDiagramToPre(el, text) {
    var lines = text.split('\n');
    var extracted = extractDiagramTitle(lines);
    var cleaned = dedent(extracted ? extracted.bodyLines.join('\n') : text);
    var pre = document.createElement('pre');
    pre.className = 'diagram-pre';
    pre.textContent = cleaned;

    if (extracted && extracted.title) {
      var wrapper = document.createElement('div');
      wrapper.className = 'diagram-titled';
      var titleBar = document.createElement('div');
      titleBar.className = 'diagram-title-bar';
      titleBar.textContent = extracted.title;
      wrapper.appendChild(titleBar);
      wrapper.appendChild(pre);
      el.innerHTML = '';
      el.appendChild(wrapper);
    } else {
      el.innerHTML = '';
      el.appendChild(pre);
    }
    el.classList.add('dg-converted');
  }

  function convertDiagrams() {
    document.querySelectorAll('.diagram').forEach(function (el) {
      if (el.querySelector('.dg-cards, .diagram-pre, .summary-card, .diagram-titled')) return;
      var text = el.textContent || '';
      if (!text.trim()) return;

      /* TÓM TẮT summary blocks → summary-card */
      if (isSummaryDiagram(text)) {
        convertDiagramToSummary(el, text);
        return;
      }

      var hasArrow  = /[→➜]|->/.test(text);
      var hasUnicode = /[│─┌└┘┐╔╗╚╝═║┬┴┼┤├]/.test(text);
      var hasBox    = /\+[-=]{2,}\+/.test(text);
      var hasAscii  = hasUnicode || hasBox;

      /* Pure arrow-list diagrams (no ASCII art) → card grid */
      if (hasArrow && !hasAscii) {
        if (convertDiagramToCards(el, text)) return;
      }

      /* Everything else → titled pre-block (title extracted from box if present) */
      convertDiagramToPre(el, text);
    });
  }

  /* ════════════════════════════════════════════════════
     3 + 4. LIST ENHANCEMENT
  ════════════════════════════════════════════════════ */

  /* Returns true if the <ul> is eligible for enhancement */
  function eligible(ul) {
    if (ul.dataset.enhanced) return false;
    if (ul.closest(SKIP_PARENTS)) return false;
    /* Skip navigation lists and TOC */
    if (ul.closest('#toc-bd, .cnav, #cnav-links')) return false;
    return true;
  }

  /* Detect whether this list is a "feature list":
     ≥ 50 % of top-level <li> start with a <strong> tag */
  function isFeatureList(items) {
    if (items.length < 2) return false;
    var strongCount = 0;
    items.forEach(function (li) {
      if (li.firstElementChild && li.firstElementChild.tagName === 'STRONG') strongCount++;
    });
    return strongCount >= Math.ceil(items.length * 0.55);
  }

  function convertToFeatCards(ul, items) {
    var grid = document.createElement('div');
    grid.className = 'feat-cards';

    items.forEach(function (li) {
      var card = document.createElement('div');
      card.className = 'feat-card';

      var strong = li.querySelector(':scope > strong');
      if (strong) {
        var titleEl = document.createElement('div');
        titleEl.className = 'feat-card-title';
        titleEl.textContent = strong.textContent;
        card.appendChild(titleEl);

        /* Everything after the <strong> */
        var rest = li.innerHTML
          .replace(/^<strong[^>]*>[\s\S]*?<\/strong>/i, '')
          .replace(/^\s*[—\-–:]\s*/, '')
          .trim();
        if (rest) {
          var desc = document.createElement('div');
          desc.className = 'feat-card-desc';
          desc.innerHTML = rest;
          card.appendChild(desc);
        }
      } else {
        var plain = document.createElement('div');
        plain.className = 'feat-card-desc';
        plain.innerHTML = li.innerHTML;
        card.appendChild(plain);
      }
      grid.appendChild(card);
    });

    ul.parentNode.replaceChild(grid, ul);
  }

  function convertToChecklist(ul) {
    ul.classList.add('check-list');
    /* Handle nested <ul> inside list items */
    ul.querySelectorAll('ul').forEach(function (nested) {
      nested.classList.add('check-list', 'nested');
    });
  }

  function enhanceLists() {
    document.querySelectorAll('ul').forEach(function (ul) {
      if (!eligible(ul)) return;
      ul.dataset.enhanced = '1';

      var items = Array.from(ul.querySelectorAll(':scope > li'));
      if (items.length === 0) return;

      if (isFeatureList(items)) {
        convertToFeatCards(ul, items);
      } else {
        convertToChecklist(ul);
      }
    });
  }

  /* ════════════════════════════════════════════════════
     5. TABLE SCROLL WRAPPER
  ════════════════════════════════════════════════════ */
  function wrapTables() {
    document.querySelectorAll('table').forEach(function (tbl) {
      if (tbl.closest('.table-wrap, nav')) return;
      var wrap = document.createElement('div');
      wrap.className = 'table-wrap';
      tbl.parentNode.insertBefore(wrap, tbl);
      wrap.appendChild(tbl);
    });
  }

  /* ════════════════════════════════════════════════════
     INIT
  ════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    loadHighlightJS();
    convertDiagrams();
    enhanceLists();
    wrapTables();
  });
}());
