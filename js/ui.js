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
    this._initStrokeWidth();
    this._initFontSize();
    this._initTextAlign();
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
    const fillBtn = document.getElementById('btn-fill-color');
    const strokeBtn = document.getElementById('btn-stroke-color');
    const fillPopup = document.getElementById('fill-color-popup');
    const strokePopup = document.getElementById('stroke-color-popup');

    // 初始化两个弹窗的选色器
    this._initPopupPicker('fill');
    this._initPopupPicker('stroke');

    // 点击色块按钮打开弹窗（定位到按钮下方）
    fillBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleColorPopup('fill', fillBtn);
    });
    strokeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this._toggleColorPopup('stroke', strokeBtn);
    });

    // 点击外部关闭弹窗
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.color-popup') && !e.target.closest('.style-btn')) {
        fillPopup.classList.remove('open');
        strokePopup.classList.remove('open');
      }
    });

    // 初始颜色
    this._syncSwatch('fill');
    this._syncSwatch('stroke');
  },

  _toggleColorPopup(type, anchorBtn) {
    const fillPopup = document.getElementById('fill-color-popup');
    const strokePopup = document.getElementById('stroke-color-popup');
    const popup = type === 'fill' ? fillPopup : strokePopup;
    const other = type === 'fill' ? strokePopup : fillPopup;

    const willOpen = !popup.classList.contains('open');
    other.classList.remove('open');
    popup.classList.toggle('open', willOpen);

    if (willOpen && anchorBtn) {
      // 定位到按钮正下方
      const rect = anchorBtn.getBoundingClientRect();
      const popupWidth = 200;
      let left = rect.left + rect.width / 2 - popupWidth / 2;
      // 防止超出屏幕
      left = Math.max(8, Math.min(left, window.innerWidth - popupWidth - 8));
      popup.style.left = left + 'px';
      popup.style.top = (rect.bottom + 8) + 'px';
      // 箭头对准按钮中心
      const arrow = popup.querySelector('.color-popup-arrow');
      const arrowLeft = rect.left + rect.width / 2 - left;
      arrow.style.left = Math.max(12, Math.min(arrowLeft, popupWidth - 12)) + 'px';
      // 同步滑块到当前颜色
      this._syncPopupFromState(type);
    }
  },

  _initPopupPicker(type) {
    const hue = document.getElementById(type + '-hue');
    const sat = document.getElementById(type + '-sat');
    const light = document.getElementById(type + '-light');
    const alpha = document.getElementById('input-' + type + '-alpha');
    const preview = document.getElementById(type + '-color-preview');

    const apply = () => {
      const h = parseInt(hue.value);
      const s = parseInt(sat.value);
      const l = parseInt(light.value);
      const hex = this._hslToHex(h, s, l);
      this._setColor(type, hex);
      // 更新饱和度/亮度滑块的背景
      this._updateSliderGradients(type, h, s, l);
    };

    hue.addEventListener('input', apply);
    sat.addEventListener('input', apply);
    light.addEventListener('input', apply);
    alpha.addEventListener('input', () => {
      if (type === 'fill') appState.fillAlpha = parseInt(alpha.value) / 100;
      else appState.strokeAlpha = parseInt(alpha.value) / 100;
      this._applyColorWithAlpha(type);
    });

    // 预设颜色
    const presetContainer = document.getElementById(type + '-preset-colors');
    this.PRESET_COLORS.forEach(color => {
      const dot = document.createElement('div');
      dot.className = 'preset-color';
      dot.style.backgroundColor = color;
      dot.title = color;
      dot.addEventListener('click', () => {
        this._setColor(type, color);
        // 同步滑块
        const hsl = this._hexToHsl(color);
        hue.value = hsl.h;
        sat.value = hsl.s;
        light.value = hsl.l;
        this._updateSliderGradients(type, hsl.h, hsl.s, hsl.l);
      });
      presetContainer.appendChild(dot);
    });
  },

  _setColor(type, hex) {
    if (type === 'fill') {
      appState.fillColor = hex;
    } else {
      appState.strokeColor = hex;
    }
    this._syncSwatch(type);
    this._applyColorWithAlpha(type);
  },

  _syncSwatch(type) {
    const color = type === 'fill' ? appState.fillColor : appState.strokeColor;
    const preview = document.getElementById(type + '-color-preview');
    if (preview) preview.style.backgroundColor = color;
    if (type === 'fill') {
      document.getElementById('fill-color-swatch').setAttribute('fill', color);
    } else {
      document.getElementById('stroke-color-swatch').setAttribute('stroke', color);
    }
  },

  _syncPopupFromState(type) {
    const color = type === 'fill' ? appState.fillColor : appState.strokeColor;
    const alpha = type === 'fill' ? (appState.fillAlpha ?? 1) : (appState.strokeAlpha ?? 1);
    const hsl = this._hexToHsl(color);
    document.getElementById(type + '-hue').value = hsl.h;
    document.getElementById(type + '-sat').value = hsl.s;
    document.getElementById(type + '-light').value = hsl.l;
    const alphaSlider = document.getElementById('input-' + type + '-alpha');
    alphaSlider.value = Math.round(alpha * 100);
    this._updateSliderGradients(type, hsl.h, hsl.s, hsl.l);
    this._syncSwatch(type);
  },

  _updateSliderGradients(type, h, s, l) {
    const sat = document.getElementById(type + '-sat');
    const light = document.getElementById(type + '-light');
    const alpha = document.getElementById('input-' + type + '-alpha');
    // 饱和度滑块：从灰色到当前色相的纯色
    sat.style.background = `linear-gradient(to right, ${this._hslToHex(h, 0, l)}, ${this._hslToHex(h, 100, l)})`;
    // 亮度滑块：从黑到当前色相纯色再到白
    light.style.background = `linear-gradient(to right, #000, ${this._hslToHex(h, s, 50)}, #fff)`;
    // 透明度滑块：从透明到当前颜色
    alpha.style.background = `linear-gradient(to right, transparent, ${this._hslToHex(h, s, l)})`;
  },

  _hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const k = n => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    const toHex = x => Math.round(255 * x).toString(16).padStart(2, '0');
    return `#${toHex(f(0))}${toHex(f(8))}${toHex(f(4))}`;
  },

  _hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
        case g: h = ((b - r) / d + 2) * 60; break;
        case b: h = ((r - g) / d + 4) * 60; break;
      }
    }
    return { h: Math.round(h), s: Math.round(s * 100), l: Math.round(l * 100) };
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
    const editingCell = Tools._tools.text?._editingCell;
    if (editingCell?.textEl) {
      editingCell.textEl.fillColor = color;
      const textarea = document.getElementById('text-editor');
      if (textarea) textarea.style.color = color;
      Renderer.markDirty();
      return;
    }
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

  /* ---------- 线条粗细 ---------- */
  _initStrokeWidth() {
    const slider = document.getElementById('input-stroke-width');
    const valDisplay = document.getElementById('stroke-width-val');
    let origValues = null;

    slider.addEventListener('pointerdown', () => {
      origValues = {};
      for (const id of Renderer.selectedIds) {
        const el = Elements.get(id);
        if (el) origValues[id] = el.strokeWidth;
      }
    });

    slider.addEventListener('input', () => {
      appState.strokeWidth = parseInt(slider.value);
      valDisplay.textContent = slider.value;
      this._applyStyleToSelected({ strokeWidth: appState.strokeWidth }, { recordHistory: false });
    });

    slider.addEventListener('change', () => {
      const val = parseInt(slider.value);
      if (origValues) {
        const commands = [];
        for (const id of Renderer.selectedIds) {
          const el = Elements.get(id);
          if (!el || origValues[id] === undefined) continue;
          if (origValues[id] !== val) {
            commands.push(new UpdateStyleCommand(el, { strokeWidth: origValues[id] }, { strokeWidth: val }));
          }
        }
        if (commands.length > 0) History.execute(new BatchCommand(commands));
        origValues = null;
      }
    });

    slider.value = appState.strokeWidth;
    valDisplay.textContent = appState.strokeWidth;
  },

  /* ---------- 字体大小 ---------- */
  _initFontSize() {
    const slider = document.getElementById('input-font-size');
    const valDisplay = document.getElementById('font-size-val');
    let origValues = null;

    slider.addEventListener('pointerdown', () => {
      origValues = {};
      for (const id of Renderer.selectedIds) {
        const el = Elements.get(id);
        if (el) origValues[id] = el.fontSize;
      }
    });

    slider.addEventListener('input', () => {
      appState.fontSize = parseInt(slider.value);
      valDisplay.textContent = slider.value;
      this._applyFontSizeToSelected(appState.fontSize, { recordHistory: false });
    });

    slider.addEventListener('change', () => {
      const val = parseInt(slider.value);
      if (origValues) {
        const commands = [];
        for (const id of Renderer.selectedIds) {
          const el = Elements.get(id);
          if (!el || origValues[id] === undefined) continue;
          if (el.type !== 'text' && el.type !== 'sticky-note') continue;
          if (origValues[id] !== val) {
            el.fontSize = val;
            commands.push(new UpdateStyleCommand(el, { fontSize: origValues[id] }, { fontSize: val }));
          }
        }
        if (commands.length > 0) History.execute(new BatchCommand(commands));
        origValues = null;
      }
    });

    slider.value = appState.fontSize;
    valDisplay.textContent = appState.fontSize;
  },

  /** 用 hex + alpha 合成 rgba 并应用到选中元素 */
  _applyColorWithAlpha(type) {
    const hex = type === 'fill' ? appState.fillColor : appState.strokeColor;
    const alpha = type === 'fill' ? (appState.fillAlpha ?? 1) : (appState.strokeAlpha ?? 1);
    const rgba = this._hexToRgba(hex, alpha);

    if (type === 'fill') {
      this._applyStyleToSelected({ fillColor: rgba }, { recordHistory: true });
    } else {
      this._applyStyleToSelected({ strokeColor: rgba }, { recordHistory: true });
      this._applyTextColorToSelected(rgba, { recordHistory: true });
    }
  },

  _hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  },

  /* ---------- 文字对齐 ---------- */
  _initTextAlign() {
    const buttons = document.querySelectorAll('.text-align-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const align = btn.dataset.align;
        appState.textAlign = align;
        this._updateAlignActive(align);
        this._applyAlignToSelected(align);
      });
    });
    this._updateAlignActive(appState.textAlign);
  },

  _updateAlignActive(align) {
    document.querySelectorAll('.text-align-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.align === align);
    });
  },

  _applyAlignToSelected(align) {
    const editingCell = Tools._tools.text?._editingCell;
    if (editingCell?.textEl) {
      editingCell.textEl.textAlign = align;
      const textarea = document.getElementById('text-editor');
      if (textarea) textarea.style.textAlign = align;
      Renderer.markDirty();
      return;
    }
    const commands = [];
    for (const id of Renderer.selectedIds) {
      const el = Elements.get(id);
      if (!el) continue;
      if (el.type !== 'text' && el.type !== 'sticky-note') {
        // 表格：如果有选中的单元格，应用对齐到表格
        if (el.type === 'table') continue; // 表格本身跳过
        continue;
      }
      const oldStyle = { textAlign: el.textAlign || 'left' };
      if (oldStyle.textAlign === align) continue;
      el.textAlign = align;
      commands.push(new UpdateStyleCommand(el, oldStyle, { textAlign: align }));
    }
    if (commands.length > 0) {
      History.execute(new BatchCommand(commands));
    }
    Renderer.markDirty();
  },

  /** 将字号应用到选中文本元素 */
  _applyFontSizeToSelected(size, { recordHistory = true } = {}) {
    const editingCell = Tools._tools.text?._editingCell;
    if (editingCell?.textEl) {
      editingCell.textEl.fontSize = size;
      const textarea = document.getElementById('text-editor');
      if (textarea) textarea.style.fontSize = Math.max(12, size * Camera.zoom) + 'px';
      Renderer.markDirty();
      return;
    }
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
    // 保存/加载已移至场景管理面板的文件操作下拉菜单
    // 从文件加载（工具栏隐藏 input）
    const inputLoad = document.getElementById('input-load-file');
    if (inputLoad) {
      inputLoad.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          if (Elements.list.length > 0 && !confirm('加载文件将替换当前画布内容，确定继续？')) {
            e.target.value = '';
            return;
          }
          SaveManager.loadFromFile(e.target.files[0]);
          e.target.value = '';
        }
      });
    }
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
          'a': 'arrow', 't': 'text', 'n': 'sticky-note', 'e': 'eraser', 'i': 'image', 'b': 'table'
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

      // 场景快捷键
      if (ctrl && e.shiftKey && e.key === 'S') {
        const name = prompt('场景名称:', '场景 ' + (_scenes.length + 1));
        if (name !== null) saveScene(name || undefined);
        e.preventDefault();
      }
      if (ctrl && e.key === '[') { prevScene(); e.preventDefault(); }
      if (ctrl && e.key === ']') { nextScene(); e.preventDefault(); }

      // 演讲模式 Ctrl+Shift+P
      if (ctrl && e.shiftKey && e.key === 'P') {
        togglePresentMode();
        e.preventDefault();
      }

      // 复制 Ctrl+C
      if (ctrl && e.key === 'c') {
        copySelected();
        e.preventDefault();
      }

      // 粘贴 Ctrl+V
      if (ctrl && e.key === 'v') {
        pasteClipboard();
        e.preventDefault();
      }

      // 全选
      if (ctrl && e.key === 'a') {
        Renderer.selectedIds = Elements.list.filter(el => !el.locked).map(el => el.id);
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
        for (const el of toDelete) {
          const idx = Elements.list.indexOf(el);
          if (idx !== -1) Elements.list.splice(idx, 1);
        }
        History.execute(new DeleteElementsCommand(toDelete));
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
    if (typeof refreshSizePanel === 'function') refreshSizePanel();
  }
};
