/* === 无边记 — UI 控制 === */

const UI = {
  /** 预设颜色 */
  PRESET_COLORS: [
    '#000000', '#ffffff', '#ff3b30', '#ff9500', '#ffcc00',
    '#34c759', '#007aff', '#5856d6', '#af52de',
    '#ff2d55', '#8e8e93', '#c9a96e'
  ],

  /** 当前主题: 'auto' | 'light' | 'dark' */
  _theme: 'auto',

  /** 初始化 UI */
  init() {
    this._initTheme();
    this._initToolButtons();
    this._initColorPickers();
    this._initPresetColors();
    this._initStrokeWidth();
    this._initFontSize();
    this._initUndoRedo();
    this._initExport();
    this._initSaveLoad();
    this._initClear();
    this._initKeyboard();
    this.updateStatus();
  },

  /* ---------- 主题切换 ---------- */
  _initTheme() {
    const root = document.documentElement;
    // 读取保存的主题偏好
    const saved = localStorage.getItem('wubianji-theme') || 'auto';
    this._theme = saved;
    this._applyTheme();

    document.getElementById('btn-theme').addEventListener('click', () => {
      // 循环切换: auto → light → dark → auto
      const cycle = { 'auto': 'light', 'light': 'dark', 'dark': 'auto' };
      this._theme = cycle[this._theme] || 'auto';
      localStorage.setItem('wubianji-theme', this._theme);
      this._applyTheme();
    });
  },

  _applyTheme() {
    const root = document.documentElement;
    if (this._theme === 'auto') {
      root.removeAttribute('data-theme');
    } else {
      root.setAttribute('data-theme', this._theme);
    }
    // 切换图标
    const iconLight = document.getElementById('icon-theme-light');
    const iconDark = document.getElementById('icon-theme-dark');
    if (iconLight && iconDark) {
      iconLight.style.display = this._theme === 'dark' ? 'none' : '';
      iconDark.style.display = this._theme === 'dark' ? '' : 'none';
    }
    Renderer.markDirty();
  },

  /* ---------- 工具按钮 ---------- */
  _initToolButtons() {
    const buttons = document.querySelectorAll('.tool-btn[data-tool]');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        Tools.switchTo(tool);
        this._updateToolActive(tool);
        this.updateStatus();
      });
    });

    // 初始状态
    this._updateToolActive('select');
  },

  _updateToolActive(toolName) {
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
  },

  /* ---------- 颜色选择器 ---------- */
  _initColorPickers() {
    const fillInput = document.getElementById('input-fill-color');
    const strokeInput = document.getElementById('input-stroke-color');
    const fillSwatch = document.getElementById('fill-color-swatch');
    const strokeSwatch = document.getElementById('stroke-color-swatch');

    fillInput.addEventListener('input', () => {
      const color = fillInput.value;
      appState.fillColor = color;
      fillSwatch.setAttribute('fill', color);
      this._updatePresetActive('fill', color);
      // 实时预览（不记录历史）
      this._applyStyleToSelected({ fillColor: color }, { recordHistory: false });
    });
    fillInput.addEventListener('change', () => {
      // 颜色选择完成，记录历史
      this._applyStyleToSelected({ fillColor: fillInput.value }, { recordHistory: true });
    });

    strokeInput.addEventListener('input', () => {
      const color = strokeInput.value;
      appState.strokeColor = color;
      strokeSwatch.setAttribute('stroke', color);
      this._updatePresetActive('stroke', color);
      // 实时预览
      this._applyStyleToSelected({ strokeColor: color }, { recordHistory: false });
      this._applyTextColorToSelected(color, { recordHistory: false });
    });
    strokeInput.addEventListener('change', () => {
      // 颜色选择完成，记录历史
      this._applyStyleToSelected({ strokeColor: strokeInput.value }, { recordHistory: true });
      this._applyTextColorToSelected(strokeInput.value, { recordHistory: true });
    });

    // 初始颜色
    fillSwatch.setAttribute('fill', appState.fillColor);
    strokeSwatch.setAttribute('stroke', appState.strokeColor);
  },

  /** 将样式应用到所有选中元素 */
  _applyStyleToSelected(styleProps, { recordHistory = true } = {}) {
    if (Renderer.selectedIds.length === 0) return;
    const commands = [];
    for (const id of Renderer.selectedIds) {
      const el = Elements.get(id);
      if (!el) continue;
      // 跳过不适用的元素类型
      if (el.type === 'text' && ('fillColor' in styleProps)) continue;

      const oldStyle = {};
      for (const key of Object.keys(styleProps)) {
        oldStyle[key] = el[key];
        el[key] = styleProps[key];
      }

      if (recordHistory) {
        const newStyle = { ...oldStyle, ...styleProps };
        if (JSON.stringify(oldStyle) !== JSON.stringify(newStyle)) {
          commands.push(new UpdateStyleCommand(el, oldStyle, newStyle));
        }
      }
    }
    if (commands.length > 0) {
      History.execute(new BatchCommand(commands));
    }
    Renderer.markDirty();
  },

  /** 专门处理文本元素颜色（用 strokeColor 作为文字颜色） */
  _applyTextColorToSelected(color, { recordHistory = true } = {}) {
    const commands = [];
    for (const id of Renderer.selectedIds) {
      const el = Elements.get(id);
      if (!el || el.type !== 'text') continue;
      const oldStyle = { fillColor: el.fillColor };
      if (oldStyle.fillColor === color) continue;
      el.fillColor = color;
      if (recordHistory) {
        commands.push(new UpdateStyleCommand(el, oldStyle, { fillColor: color }));
      }
    }
    if (commands.length > 0) {
      History.execute(new BatchCommand(commands));
    }
    Renderer.markDirty();
  },

  /* ---------- 预设颜色 ---------- */
  _initPresetColors() {
    const container = document.getElementById('preset-colors');
    this.PRESET_COLORS.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'preset-color';
      dot.style.backgroundColor = color;
      if (color === '#000000') dot.classList.add('active'); // 默认描边色选中
      dot.title = color + '\n单击=描边/文字色  双击=填充色';

      dot.addEventListener('click', () => {
        appState.strokeColor = color;
        document.getElementById('input-stroke-color').value = color;
        document.getElementById('stroke-color-swatch').setAttribute('stroke', color);
        this._updatePresetActive('stroke', color);
        // 应用到选中元素
        this._applyStyleToSelected({ strokeColor: color });
        this._applyTextColorToSelected(color);
      });

      dot.addEventListener('dblclick', () => {
        appState.fillColor = color;
        document.getElementById('input-fill-color').value = color;
        document.getElementById('fill-color-swatch').setAttribute('fill', color);
        this._updatePresetActive('fill', color);
        // 应用到选中元素（不含文本）
        this._applyStyleToSelected({ fillColor: color });
      });

      dot.addEventListener('dblclick', () => {
        appState.fillColor = color;
        document.getElementById('input-fill-color').value = color;
        document.getElementById('fill-color-swatch').setAttribute('fill', color);
        this._updatePresetActive('fill', color);
      });

      container.appendChild(dot);
    });
  },

  _updatePresetActive(type, color) {
    // 只更新没有特定类型区分的视觉反馈
    const dots = document.querySelectorAll('.preset-color');
    dots.forEach(d => {
      if (d.style.backgroundColor === color) {
        d.classList.add('active');
      } else {
        // 不完全移除，因为可能两个颜色相同
      }
    });
  },

  /* ---------- 线条粗细 ---------- */
  _initStrokeWidth() {
    const slider = document.getElementById('input-stroke-width');
    const valDisplay = document.getElementById('stroke-width-val');

    slider.addEventListener('input', () => {
      appState.strokeWidth = parseInt(slider.value);
      valDisplay.textContent = slider.value;
      // 实时预览（不记录历史）
      this._applyStyleToSelected({ strokeWidth: appState.strokeWidth }, { recordHistory: false });
    });

    slider.addEventListener('change', () => {
      // 拖动结束，记录历史
      this._applyStyleToSelected({ strokeWidth: appState.strokeWidth }, { recordHistory: true });
    });

    slider.value = appState.strokeWidth;
    valDisplay.textContent = appState.strokeWidth;
  },

  /* ---------- 字体大小 ---------- */
  _initFontSize() {
    const slider = document.getElementById('input-font-size');
    const valDisplay = document.getElementById('font-size-val');

    slider.addEventListener('input', () => {
      appState.fontSize = parseInt(slider.value);
      valDisplay.textContent = slider.value;
      // 实时预览（不记录历史）
      this._applyFontSizeToSelected(appState.fontSize, { recordHistory: false });
    });

    slider.addEventListener('change', () => {
      // 拖动结束，记录历史
      this._applyFontSizeToSelected(appState.fontSize, { recordHistory: true });
    });

    slider.value = appState.fontSize;
    valDisplay.textContent = appState.fontSize;
  },

  /** 将字号应用到选中文本元素 */
  _applyFontSizeToSelected(size, { recordHistory = true } = {}) {
    const commands = [];
    for (const id of Renderer.selectedIds) {
      const el = Elements.get(id);
      if (!el) continue;
      if (el.type !== 'text' && el.type !== 'sticky-note') continue;
      const oldStyle = { fontSize: el.fontSize };
      if (oldStyle.fontSize === size) continue;
      el.fontSize = size;
      if (recordHistory) {
        commands.push(new UpdateStyleCommand(el, oldStyle, { fontSize: size }));
      }
    }
    if (commands.length > 0) {
      History.execute(new BatchCommand(commands));
    }
    Renderer.markDirty();
  },

  /* ---------- 撤销/重做按钮 ---------- */
  _initUndoRedo() {
    document.getElementById('btn-undo').addEventListener('click', () => {
      History.undo();
      Renderer.markDirty();
    });
    document.getElementById('btn-redo').addEventListener('click', () => {
      History.redo();
      Renderer.markDirty();
    });
    this._updateUndoRedoButtons();
  },

  _updateUndoRedoButtons() {
    document.getElementById('btn-undo').disabled = !History.canUndo();
    document.getElementById('btn-redo').disabled = !History.canRedo();
  },

  /* ---------- 导出 ---------- */
  _initExport() {
    document.getElementById('btn-export').addEventListener('click', () => {
      Renderer.exportPNG();
    });
  },

  /* ---------- 保存/加载 ---------- */
  _initSaveLoad() {
    // 保存到文件
    document.getElementById('btn-save').addEventListener('click', () => {
      SaveManager.saveToFile();
    });

    // 从文件加载
    document.getElementById('btn-load').addEventListener('click', () => {
      document.getElementById('input-load-file').click();
    });
    document.getElementById('input-load-file').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        if (Elements.list.length > 0 && !confirm('加载文件将替换当前画布内容，确定继续？')) {
          e.target.value = '';
          return;
        }
        SaveManager.loadFromFile(e.target.files[0]);
        e.target.value = '';
      }
    });
  },

  /* ---------- 清空 ---------- */
  _initClear() {
    document.getElementById('btn-clear').addEventListener('click', () => {
      if (Elements.list.length === 0) return;
      if (confirm('确定要清空画布上的所有内容吗？此操作可以撤销。')) {
        const allElements = [...Elements.list];
        Elements.list = [];
        Renderer.selectedIds = [];
        History.execute(new DeleteElementsCommand(allElements));
        Renderer.markDirty();
        this.updateStatus();
      }
    });
  },

  /* ---------- 键盘快捷键 ---------- */
  _initKeyboard() {
    document.addEventListener('keydown', (e) => {
      // 文本编辑时不处理
      const textarea = document.getElementById('text-editor');
      if (textarea.style.display !== 'none' && document.activeElement === textarea) {
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;

      // 工具快捷键
      if (!ctrl) {
        const keyMap = {
          'v': 'select', 'h': 'hand', 'p': 'pen',
          'r': 'rectangle', 'o': 'ellipse', 'l': 'line',
          'a': 'arrow', 't': 'text', 'n': 'sticky-note', 'e': 'eraser'
        };
        if (keyMap[e.key.toLowerCase()] && !e.target.closest('input, textarea')) {
          const tool = keyMap[e.key.toLowerCase()];
          Tools.switchTo(tool);
          this._updateToolActive(tool);
          this.updateStatus();
          e.preventDefault();
        }
      }

      // 撤销/重做
      if (ctrl && !e.shiftKey && e.key === 'z') {
        History.undo();
        Renderer.markDirty();
        e.preventDefault();
      }
      if (ctrl && e.shiftKey && e.key === 'Z') {
        History.redo();
        Renderer.markDirty();
        e.preventDefault();
      }
      if (ctrl && e.key === 'y') {
        History.redo();
        Renderer.markDirty();
        e.preventDefault();
      }

      // 导出
      if (ctrl && e.key === 'e') {
        Renderer.exportPNG();
        e.preventDefault();
      }

      // 保存 (Ctrl+S)
      if (ctrl && e.key === 's') {
        SaveManager.saveToFile();
        e.preventDefault();
      }

      // 全选
      if (ctrl && e.key === 'a') {
        Renderer.selectedIds = Elements.list.map(el => el.id);
        Renderer.markDirty();
        e.preventDefault();
      }

      // 编组 Ctrl+G
      if (ctrl && !e.shiftKey && e.key === 'g') {
        if (Renderer.selectedIds.length >= 2) {
          const groupId = Elements.group(Renderer.selectedIds);
          if (groupId) {
            History.execute(new GroupCommand(Renderer.selectedIds, groupId));
            UI.updateStatus();
          }
        }
        e.preventDefault();
      }

      // 取消编组 Ctrl+Shift+G
      if (ctrl && e.shiftKey && e.key === 'G') {
        const count = Elements.ungroupElements(Renderer.selectedIds);
        if (count > 0) {
          // 记录到历史（简化：记录一个标记）
          History.execute(new UngroupCommand(Renderer.selectedIds));
          UI.updateStatus();
        }
        e.preventDefault();
      }

      // Delete / Backspace 删除选中
      if ((e.key === 'Delete' || e.key === 'Backspace') && Renderer.selectedIds.length > 0) {
        const toDelete = Renderer.selectedIds.map(id => Elements.get(id)).filter(Boolean);
        const indexed = toDelete.map(el => ({ el, index: Elements.list.indexOf(el) }));
        for (const { el } of indexed) {
          const idx = Elements.list.indexOf(el);
          if (idx !== -1) Elements.list.splice(idx, 1);
        }
        History.execute(new DeleteElementsCommand(indexed));
        Renderer.selectedIds = [];
        Renderer.markDirty();
        this.updateStatus();
        e.preventDefault();
      }

      // Shift 键追踪（用于等比缩放）
      if (e.key === 'Shift') {
        window._shiftKey = true;
      }
    });

    document.addEventListener('keyup', (e) => {
      if (e.key === 'Shift') {
        window._shiftKey = false;
        // 如果在缩放中，更新预览
        Renderer.markDirty();
      }
    });
  },

  /* ---------- 状态栏 ---------- */
  updateStatus() {
    const toolNames = {
      'select': '选择', 'hand': '抓手', 'pen': '画笔',
      'rectangle': '矩形', 'ellipse': '椭圆', 'line': '直线',
      'arrow': '箭头', 'text': '文本', 'sticky-note': '便签',
      'eraser': '橡皮擦'
    };

    document.getElementById('status-tool').textContent = toolNames[Tools.current] || Tools.current;
    document.getElementById('status-zoom').textContent = Math.round(Camera.zoom * 100) + '%';
    const count = Elements.list.length;
    document.getElementById('status-count').textContent = count + ' 个元素';

    this._updateUndoRedoButtons();
  }
};
