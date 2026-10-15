/* === 无边记 — 文字搜索 === */

const SearchManager = {
  query: '',
  matches: [],     // 命中元素数组（按 zIndex 升序）
  current: -1,     // 当前命中的索引

  /** 提取元素的可搜索文字 */
  _textOf(el) {
    if (el.type === 'text' || el.type === 'sticky-note') {
      return el.text || '';
    }
    if (el.type === 'table' && el.cells) {
      const parts = [];
      for (const row of el.cells) {
        if (!row) continue;
        for (const cell of row) {
          parts.push(typeof cell === 'string' ? cell : (cell?.text || ''));
        }
      }
      return parts.join('\n');
    }
    return '';
  },

  /** 执行搜索 */
  run(q) {
    this.query = q;
    this.matches = [];
    this.current = -1;

    if (q) {
      const needle = q.toLowerCase();
      const hits = [];
      for (const el of Elements.list) {
        const t = this._textOf(el);
        if (t && t.toLowerCase().includes(needle)) {
          hits.push(el);
        }
      }
      hits.sort((a, b) => a.zIndex - b.zIndex);
      this.matches = hits;
    }

    if (this.matches.length > 0) {
      this.goTo(0);
    } else {
      this._clearHighlight();
    }
    this.updateUI();
  },

  /** 跳转到第 i 个命中（循环） */
  goTo(i) {
    if (this.matches.length === 0) return;
    this.current = (i + this.matches.length) % this.matches.length;
    const el = this.matches[this.current];
    Renderer.selectedIds = [el.id];
    const b = Elements.getBounds(el);
    Camera.centerOn((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    Renderer.searchHighlight = b;
    Renderer.markDirty();
  },

  next() {
    if (this.matches.length) this.goTo(this.current + 1);
  },

  prev() {
    if (this.matches.length) this.goTo(this.current - 1);
  },

  _clearHighlight() {
    Renderer.searchHighlight = null;
    Renderer.markDirty();
  },

  /** 刷新搜索框 UI */
  updateUI() {
    const countEl = document.getElementById('search-count');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');
    if (!countEl) return;

    const disabled = this.matches.length === 0;
    if (prevBtn) prevBtn.disabled = disabled;
    if (nextBtn) nextBtn.disabled = disabled;

    if (!this.query) {
      countEl.textContent = '';
    } else if (disabled) {
      countEl.textContent = '无结果';
    } else {
      countEl.textContent = (this.current + 1) + ' / ' + this.matches.length;
    }
  },

  /** 打开搜索面板 */
  open() {
    const panel = document.getElementById('search-panel');
    if (!panel) return;
    panel.style.display = 'flex';
    const input = document.getElementById('search-input');
    input.focus();
    input.select();
  },

  /** 关闭搜索面板并清除高亮 */
  close() {
    const panel = document.getElementById('search-panel');
    if (panel) panel.style.display = 'none';
    const input = document.getElementById('search-input');
    if (input) input.value = '';
    this.query = '';
    this.matches = [];
    this.current = -1;
    this._clearHighlight();
    this.updateUI();
  },

  /** 绑定搜索面板事件 */
  init() {
    const input = document.getElementById('search-input');
    const prevBtn = document.getElementById('search-prev');
    const nextBtn = document.getElementById('search-next');
    const closeBtn = document.getElementById('search-close');
    const searchBtn = document.getElementById('btn-search');

    if (searchBtn) searchBtn.addEventListener('click', () => this.open());

    if (input) {
      // 实时搜索
      input.addEventListener('input', () => this.run(input.value));
      // Enter 下一个 / Shift+Enter 上一个
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          if (e.shiftKey) this.prev();
          else this.next();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          this.close();
        }
      });
    }
    if (prevBtn) prevBtn.addEventListener('click', () => this.prev());
    if (nextBtn) nextBtn.addEventListener('click', () => this.next());
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());
  }
};
