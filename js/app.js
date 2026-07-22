/* === 无边记 — 主应用 === */

/** 全局应用状态 */
const appState = {
  fillColor: '#ffffff',
  strokeColor: '#000000',
  fillAlpha: 1,
  strokeAlpha: 1,
  strokeWidth: 2,
  fontSize: 20,
  textAlign: 'left',
};

/** 剪贴板 */
let _clipboard = [];
let _scenes = [];
let _currentScene = -1;
let _presentMode = false;

/** 场景管理面板状态 */
let _scenePanelOpen = false;
let _scenePanelSelected = new Set(); // 选中的场景索引
let _scenePanelDragIdx = -1;        // 正在拖拽的场景索引

/** 当历史状态改变时的回调 */
function onHistoryChange() {
  UI._updateUndoRedoButtons();
  UI.updateStatus();
  SaveManager.autoSave();
}

/* ================================================================
 *  保存/加载系统
 * ================================================================ */
const SaveManager = {
  STORAGE_KEY: 'wubianji-data',
  _saveTimer: null,

  /** 序列化当前状态 */
  serialize() {
	    return JSON.stringify({
	      version: 1,
	      camera: { x: Camera.x, y: Camera.y, zoom: Camera.zoom },
	      elements: Elements.list,
	      scenes: _scenes,
	    });
  },

  /** 反序列化并恢复状态 */
  deserialize(json) {
    try {
      const data = JSON.parse(json);
      if (!data || data.version !== 1) return false;

      // 恢复元素
      Elements.list = data.elements || [];
      Elements._idCounter = Elements.list.length;

      // 恢复相机
      if (data.camera) {
        Camera.x = data.camera.x || 0;
        Camera.y = data.camera.y || 0;
        Camera.zoom = data.camera.zoom || 1;
      }

      // 恢复场景
      _scenes = data.scenes || [];
      _currentScene = _scenes.length > 0 ? 0 : -1;
      refreshSceneUI();

      // 清空历史（无法跨会话撤销）
      History.clear();

      // 清空选中
      Renderer.selectedIds = [];
      Renderer.markDirty();
      UI.updateStatus();

      return true;
    } catch (e) {
      console.error('加载数据失败:', e);
      return false;
    }
  },

  /** 保存到 localStorage */
  saveToLocal() {
    try {
      const json = this.serialize();
      localStorage.setItem(this.STORAGE_KEY, json);
      return true;
    } catch (e) {
      console.warn('localStorage 保存失败（可能空间不足）:', e);
      return false;
    }
  },

  /** 从 localStorage 加载 */
  loadFromLocal() {
    try {
      const json = localStorage.getItem(this.STORAGE_KEY);
      if (!json) return false;
      return this.deserialize(json);
    } catch (e) {
      return false;
    }
  },

  /** 删除 localStorage 中的数据 */
  clearLocal() {
    localStorage.removeItem(this.STORAGE_KEY);
  },

  /** 防抖自动保存（500ms） */
  autoSave() {
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => {
      this.saveToLocal();
    }, 500);
  },

  /** 导出为 JSON 文件并下载 */
  saveToFile() {
    const json = this.serialize();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = '无边记_' + new Date().toISOString().slice(0, 10) + '.json';
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  },

  /** 从 JSON 文件加载 */
  loadFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const success = this.deserialize(e.target.result);
      if (success) {
        this.saveToLocal(); // 加载后立即保存到 localStorage
        UI.updateStatus();
        console.log('✅ 文件加载成功');
      } else {
        alert('文件格式不正确，加载失败。');
      }
    };
    reader.readAsText(file);
  }
};

/* ================================================================
 *  初始化
 * ================================================================ */
(function init() {
  // 1. 初始化渲染器
  Renderer.init();

  // 2. 居中相机（默认值，可能被加载数据覆盖）
  const canvas = document.getElementById('main-canvas');
  const cw = canvas.width / (window.devicePixelRatio || 1);
  const ch = canvas.height / (window.devicePixelRatio || 1);
  Camera.x = cw / 2;
  Camera.y = ch / 2;

  // 3. 尝试加载已保存的数据
  const loaded = SaveManager.loadFromLocal();

  // 4. 每次打开默认 100% 视图
  Camera.zoom = 1;

  // 5. 如果没有已保存数据，添加欢迎元素
  if (!loaded) {
    Camera.x = cw / 2;
    Camera.y = ch / 2;
    addWelcomeElements();
    SaveManager.saveToLocal();
  }

  // 5. 初始化 UI
  UI.init();

  // 6. 初始化尺寸面板
  initSizePanel();

  // 7. 绑定事件
  bindCanvasEvents();

  // 8. 图片插入
  initImageInsert();

  // 8.5 场景
  initSceneUI();

  // 9. 启动渲染循环
  Renderer.startLoop();

  console.log('无边记已就绪 🎨');
  if (loaded) {
    console.log('📂 已恢复上次的 ' + Elements.list.length + ' 个元素');
  }
  console.log('💾 自动保存到浏览器存储 | Ctrl+S 保存为文件');
  console.log('工具: V=选择 H=抓手 P=画笔 R=矩形 O=椭圆 L=直线 A=箭头 T=文本 N=便签 E=橡皮擦');
  console.log('快捷键: Ctrl+Z=撤销 Ctrl+Shift+Z=重做 Delete=删除 Ctrl+E=导出 Ctrl+S=保存 Ctrl+A=全选');
  console.log('缩放: Ctrl+滚轮 或 双指捏合, 平移: 中键拖拽 或 空格+拖拽');
})();

/* ================================================================
 *  画布事件绑定
 * ================================================================ */
function bindCanvasEvents() {
  const canvas = document.getElementById('main-canvas');

  // ---- 鼠标事件 ----
  canvas.addEventListener('mousedown', (e) => {
    if (e.button === 0) { // 左键
      Tools.onMouseDown(e.clientX, e.clientY, e);
    } else if (e.button === 1) { // 中键：临时抓手
      e.preventDefault();
      startMiddlePan(e.clientX, e.clientY);
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    Tools.onMouseMove(e.clientX, e.clientY, e);
    if (middlePanning) {
      updateMiddlePan(e.clientX, e.clientY);
    }
    // 更新状态栏缩放比例
    document.getElementById('status-zoom').textContent = Math.round(Camera.zoom * 100) + '%';
  });

  canvas.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
      Tools.onMouseUp(e.clientX, e.clientY, e);
    } else if (e.button === 1) {
      endMiddlePan();
    }
    UI.updateStatus();
  });

  canvas.addEventListener('dblclick', (e) => {
    Tools.onDblClick(e.clientX, e.clientY, e);
  });

  // ---- 滚轮缩放 ----
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+滚轮缩放
      const factor = e.deltaY < 0 ? 1.1 : 0.9;
      Camera.zoomAt(e.clientX, e.clientY, factor);
    } else {
      // 普通滚轮平移
      Camera.pan(-e.deltaX, -e.deltaY);
    }
    Renderer.markDirty();
    UI.updateStatus();
  }, { passive: false });

  // ---- 右键菜单 ----
  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
  });

  // 点击其他地方关闭菜单
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('context-menu');
    if (menu.style.display !== 'none' && !menu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // Escape 关闭菜单
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
  });

  // 滚轮/缩放时关闭菜单
  canvas.addEventListener('wheel', () => {
    hideContextMenu();
  });

  // ---- 触控事件 ----
  let touches = {};
  let lastPinchDist = 0;
  let pinchCenter = null;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      touches[t.identifier] = { x: t.clientX, y: t.clientY };
    }

    const keys = Object.keys(touches);
    if (keys.length === 1) {
      // 单指：视为鼠标按下
      const t = touches[keys[0]];
      Tools.onMouseDown(t.x, t.y, { shiftKey: false, button: 0 });
    } else if (keys.length === 2) {
      // 双指：准备捏合缩放
      const t0 = touches[keys[0]];
      const t1 = touches[keys[1]];
      lastPinchDist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
      pinchCenter = {
        x: (t0.x + t1.x) / 2,
        y: (t0.y + t1.y) / 2
      };
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const keys = Object.keys(touches);
    const newTouches = {};
    for (const t of e.touches) {
      newTouches[t.identifier] = { x: t.clientX, y: t.clientY };
    }

    if (keys.length === 1 && Object.keys(newTouches).length === 1) {
      // 单指拖拽
      const t = newTouches[Object.keys(newTouches)[0]];
      Tools.onMouseMove(t.x, t.y, { shiftKey: false, button: 0, buttons: 1 });
    } else if (keys.length >= 2 && Object.keys(newTouches).length >= 2) {
      // 双指缩放+平移
      const ids = Object.keys(newTouches);
      const t0 = newTouches[ids[0]];
      const t1 = newTouches[ids[1]];
      const dist = Math.hypot(t1.x - t0.x, t1.y - t0.y);
      const center = { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 };

      if (lastPinchDist > 0 && pinchCenter) {
        const factor = dist / lastPinchDist;
        Camera.zoomAt(pinchCenter.x, pinchCenter.y, factor);

        // 平移
        Camera.pan(center.x - pinchCenter.x, center.y - pinchCenter.y);
      }

      lastPinchDist = dist;
      pinchCenter = center;
    }

    touches = newTouches;
    Renderer.markDirty();
  }, { passive: false });

  canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      delete touches[t.identifier];
    }
    if (Object.keys(touches).length < 2) {
      // 缩放到单指
      lastPinchDist = 0;
      pinchCenter = null;
      if (Object.keys(touches).length === 0) {
        // 所有手指松开
        Tools.onMouseUp(0, 0, { shiftKey: false, button: 0 });
      }
    }
    UI.updateStatus();
  }, { passive: false });

  // ---- 窗口大小变化 ----
  window.addEventListener('resize', () => {
    Renderer._resize();
    UI.updateStatus();
  });
}

/* ================================================================
 *  中键平移（临时抓手）
 * ================================================================ */
let middlePanning = false;
let middleStartMX = 0, middleStartMY = 0;

function startMiddlePan(sx, sy) {
  middlePanning = true;
  middleStartMX = sx;
  middleStartMY = sy;
  document.getElementById('main-canvas').style.cursor = 'grabbing';
}

function updateMiddlePan(sx, sy) {
  if (!middlePanning) return;
  Camera.pan(sx - middleStartMX, sy - middleStartMY);
  middleStartMX = sx;
  middleStartMY = sy;
  Renderer.markDirty();
}

function endMiddlePan() {
  middlePanning = false;
  document.getElementById('main-canvas').style.cursor = Tools._tools[Tools.current]?.cursor || 'default';
}

/* ================================================================
 *  空格键临时切换抓手
 * ================================================================ */
document.addEventListener('keydown', (e) => {
  if (e.key === ' ' && !e.repeat) {
    const textarea = document.getElementById('text-editor');
    if (textarea.style.display !== 'none' && document.activeElement === textarea) return;
    if (e.target.closest('input, textarea, button')) return;
    e.preventDefault();
    // 记住当前工具，临时切到抓手
    if (Tools.current !== 'hand') {
      window._prevTool = Tools.current;
      Tools.switchTo('hand');
      UI._updateToolActive('hand');
    }
  }
});

document.addEventListener('keyup', (e) => {
  if (e.key === ' ' && window._prevTool) {
    const textarea = document.getElementById('text-editor');
    if (textarea.style.display !== 'none' && document.activeElement === textarea) return;
    Tools.switchTo(window._prevTool);
    UI._updateToolActive(window._prevTool);
    UI.updateStatus();
    window._prevTool = null;
  }
});

/* ================================================================
 *  复制 / 粘贴 / 锁定
 * ================================================================ */

/** 复制选中元素到剪贴板 */
function copySelected() {
  if (Renderer.selectedIds.length === 0) return;
  _clipboard = Renderer.selectedIds
    .map(id => Elements.get(id))
    .filter(Boolean)
    .map(el => {
      // 深拷贝元素数据（不含 id）
      const copy = { ...el };
      delete copy.id;
      return copy;
    });
  console.log('📋 已复制 ' + _clipboard.length + ' 个元素');
}

/** 粘贴剪贴板中的元素 */
function pasteClipboard() {
  if (_clipboard.length === 0) return;
  const offset = 30;
  const newElements = [];
  for (const data of _clipboard) {
    const el = Elements.create(data.type, {
      ...data,
      x: data.x + offset,
      y: data.y + offset,
      groupId: null,
    });
    newElements.push(el);
  }
  History.execute(new AddElementsCommand(newElements));
  Renderer.selectedIds = newElements.map(el => el.id);
  Renderer.markDirty();
  UI.updateStatus();
  console.log('📋 已粘贴 ' + newElements.length + ' 个元素');
}

/** 锁定选中元素 */
function lockSelected() {
  const commands = [];
  for (const id of Renderer.selectedIds) {
    const el = Elements.get(id);
    if (!el || el.locked) continue;
    el.locked = true;
    commands.push(new UpdateStyleCommand(el, { locked: false }, { locked: true }));
  }
  if (commands.length > 0) History.execute(new BatchCommand(commands));
  Renderer.markDirty();
}

/** 解锁选中元素 */
function unlockSelected() {
  const commands = [];
  for (const id of Renderer.selectedIds) {
    const el = Elements.get(id);
    if (!el || !el.locked) continue;
    el.locked = false;
    commands.push(new UpdateStyleCommand(el, { locked: true }, { locked: false }));
  }
  if (commands.length > 0) History.execute(new BatchCommand(commands));
  Renderer.markDirty();
}

/** 切换锁定状态 */
function toggleLock() {
  const anyLocked = Renderer.selectedIds.some(id => {
    const el = Elements.get(id);
    return el && el.locked;
  });
  if (anyLocked) unlockSelected(); else lockSelected();
}

/** 为形状自动添加居中文字 */
function startShapeText(shapeEl) {
  const cx = shapeEl.x + shapeEl.width / 2;
  const cy = shapeEl.y + shapeEl.height / 2;
  const textEl = Elements.create('text', {
    x: cx - 50, y: cy - 12,
    width: 100, height: 24,
    text: '',
    fontSize: Math.min(20, Math.max(12, shapeEl.height / 6)),
    fillColor: shapeEl.strokeColor || '#000000',
    strokeColor: 'transparent',
    strokeWidth: 0,
    textAlign: 'center',
    fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
  });
  // 编组（不手动 push，由 AddElementCommand 负责）
  const groupId = 'grp_' + Date.now().toString(36);
  shapeEl.groupId = groupId;
  textEl.groupId = groupId;
  History.execute(new BatchCommand([
    new AddElementCommand(textEl),
    new GroupCommand([shapeEl.id, textEl.id], groupId)
  ]));
  Renderer.selectedIds = [shapeEl.id, textEl.id];
  Renderer.markDirty();
  Tools.switchTo('text');
  Tools._tools['text'].startEditing(textEl);
}

/* ================================================================
 *  表格操作
 * ================================================================ */

/** 获取点击位置所在的单元格 */
function getTableCell(el, wx, wy) {
  if (el.type !== 'table') return null;
  let cy = el.y;
  for (let r = 0; r < el.rowHeights.length; r++) {
    let cx = el.x;
    for (let c = 0; c < el.colWidths.length; c++) {
      if (wx >= cx && wx <= cx + el.colWidths[c] &&
          wy >= cy && wy <= cy + el.rowHeights[r]) {
        return { row: r, col: c };
      }
      cx += el.colWidths[c];
    }
    cy += el.rowHeights[r];
  }
  return null;
}

/** 编辑表格单元格 */
function editTableCell(tableEl, row, col) {
  const cell = (tableEl.cells[row] && tableEl.cells[row][col]);
  const cellText = typeof cell === 'string' ? cell : (cell?.text || '');
  const cellFz = (cell && cell.fontSize) || tableEl.defaultFontSize || 14;
  const cellColor = (cell && cell.color) || '#000000';
  const cellAlign = (cell && cell.textAlign) || 'left';

  let cellX = tableEl.x, cellY = tableEl.y;
  for (let c = 0; c < col; c++) cellX += tableEl.colWidths[c];
  for (let r = 0; r < row; r++) cellY += tableEl.rowHeights[r];

  const textEl = {
    type: 'text', id: '_table_cell_',
    x: cellX + 2, y: cellY + 2,
    width: tableEl.colWidths[col] - 4,
    height: tableEl.rowHeights[row] - 4,
    text: cellText,
    fontSize: cellFz,
    fillColor: cellColor,
    strokeColor: 'transparent', strokeWidth: 0,
    textAlign: cellAlign,
    fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
  };

  const origCommit = Tools._tools['text']._commitEditing;
  const textTool = Tools._tools['text'];
  // 记录正在编辑的单元格，供渲染器跳过
  textTool._editingCell = { table: tableEl, row, col, textEl };

  textTool._commitEditing = function() {
    const textarea = document.getElementById('text-editor');
    if (!textarea || textarea.style.display === 'none') {
      textTool._commitEditing = origCommit;
      textTool._editingCell = null;
      return;
    }
    const newText = textarea.value;
    if (tableEl.cells[row] && tableEl.cells[row][col] !== undefined) {
      tableEl.cells[row][col] = {
        text: newText,
        fontSize: textEl.fontSize,
        color: textEl.fillColor,
        textAlign: textEl.textAlign,
      };
    }
    textTool._commitEditing = origCommit;
    textTool._editingCell = null;
    origCommit.call(textTool);
    Renderer.markDirty();
    SaveManager.autoSave();
  };

  Tools._tools['text'].startEditing(textEl);
}

function getTableState(tableEl) {
  return {
    rows: tableEl.rows,
    cols: tableEl.cols,
    width: tableEl.width,
    height: tableEl.height,
    colWidths: tableEl.colWidths,
    rowHeights: tableEl.rowHeights,
    cells: tableEl.cells
  };
}

// 右键点击时记录的世界坐标（供表格操作使用）
let _ctxWorldPos = { x: 0, y: 0 };

/** 添加行 */
function tableAddRow(tableEl, afterRow) {
  const oldState = getTableState(tableEl);
  const newRow = afterRow ?? tableEl.rows - 1;
  const rowH = 30;
  tableEl.rows++;
  tableEl.rowHeights.splice(newRow + 1, 0, rowH);
  tableEl.cells.splice(newRow + 1, 0, Array(tableEl.cols).fill(''));
  tableEl.height = tableEl.rowHeights.reduce((a, b) => a + b, 0);
  History.execute(new TableStateCommand(tableEl, oldState, getTableState(tableEl)));
  Renderer.markDirty();
}

/** 删除行 */
function tableDeleteRow(tableEl, row) {
  if (tableEl.rows <= 1) return;
  const oldState = getTableState(tableEl);
  tableEl.rows--;
  tableEl.rowHeights.splice(row, 1);
  tableEl.cells.splice(row, 1);
  tableEl.height = tableEl.rowHeights.reduce((a, b) => a + b, 0);
  History.execute(new TableStateCommand(tableEl, oldState, getTableState(tableEl)));
  Renderer.markDirty();
}

/** 添加列 */
function tableAddCol(tableEl, afterCol) {
  const oldState = getTableState(tableEl);
  const newCol = afterCol ?? tableEl.cols - 1;
  const colW = 80;
  tableEl.cols++;
  tableEl.colWidths.splice(newCol + 1, 0, colW);
  for (const row of tableEl.cells) row.splice(newCol + 1, 0, '');
  tableEl.width = tableEl.colWidths.reduce((a, b) => a + b, 0);
  History.execute(new TableStateCommand(tableEl, oldState, getTableState(tableEl)));
  Renderer.markDirty();
}

/** 删除列 */
function tableDeleteCol(tableEl, col) {
  if (tableEl.cols <= 1) return;
  const oldState = getTableState(tableEl);
  tableEl.cols--;
  tableEl.colWidths.splice(col, 1);
  for (const row of tableEl.cells) row.splice(col, 1);
  tableEl.width = tableEl.colWidths.reduce((a, b) => a + b, 0);
  History.execute(new TableStateCommand(tableEl, oldState, getTableState(tableEl)));
  Renderer.markDirty();
}

/** 图片插入功能 */
function initImageInsert() {
  const input = document.getElementById('input-image-file');
  if (!input) return;

  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        // 压缩：限制最大 1200px，JPEG quality 0.85
        let w = img.width, h = img.height;
        const maxSize = 1200;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }

        const compressCanvas = document.createElement('canvas');
        compressCanvas.width = w;
        compressCanvas.height = h;
        const cctx = compressCanvas.getContext('2d');
        cctx.drawImage(img, 0, 0, w, h);
        const compressedDataUrl = compressCanvas.toDataURL('image/jpeg', 0.85);

        // 在画布中央创建
        const center = Camera.screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
        const el = Elements.create('image', {
          x: center.x - w / 2, y: center.y - h / 2,
          width: w, height: h,
          src: compressedDataUrl,
          fillColor: 'transparent',
          strokeColor: 'transparent',
          strokeWidth: 0,
        });
        History.execute(new AddElementCommand(el));
        Renderer.selectedIds = [el.id];
        Renderer.markDirty();
        UI.updateStatus();
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
    input.value = '';
  });
}

/* ================================================================
 *  右键菜单
 * ================================================================ */
let _ctxTargetId = null;

function showContextMenu(mx, my) {
  const menu = document.getElementById('context-menu');
  if (!menu) return;

  // 查找光标下的元素
  const w = Camera.screenToWorld(mx, my);
  const hit = Elements.hitTest(w.x, w.y);

  if (!hit) {
    hideContextMenu();
    return;
  }

  _ctxTargetId = hit.id;
  _ctxWorldPos = { x: w.x, y: w.y };

  // 如果没有选中该元素，先选中它
  if (!Renderer.selectedIds.includes(hit.id)) {
    Renderer.selectedIds = [hit.id];
    Renderer.markDirty();
  }

  // 动态更新锁定菜单项文字
  const lockItem = menu.querySelector('[data-action="lock"]');
  if (lockItem) {
    lockItem.textContent = hit.locked ? '🔓 解锁' : '🔒 锁定';
  }

  // 表格菜单项只在选中表格时显示
  const isTable = hit.type === 'table';
  menu.querySelectorAll('[data-action^="table-"]').forEach(item => {
    item.style.display = isTable ? '' : 'none';
  });
  if (isTable) {
    const sepBefore = menu.querySelector('[data-action="table-add-row"]').previousElementSibling;
    if (sepBefore && sepBefore.classList.contains('ctx-sep')) sepBefore.style.display = '';
    const sepAfter = menu.querySelector('[data-action="table-del-col"]').nextElementSibling;
    if (sepAfter && sepAfter.classList.contains('ctx-sep')) sepAfter.style.display = '';
  } else {
    const sepBefore = menu.querySelector('[data-action="table-add-row"]').previousElementSibling;
    if (sepBefore && sepBefore.classList.contains('ctx-sep')) sepBefore.style.display = 'none';
    const sepAfter = menu.querySelector('[data-action="table-del-col"]').nextElementSibling;
    if (sepAfter && sepAfter.classList.contains('ctx-sep')) sepAfter.style.display = 'none';
  }

  // 定位菜单（确保不超出视口）
  menu.style.display = 'block';
  const mw = menu.offsetWidth || 150;
  const mh = menu.offsetHeight || 100;
  let left = mx;
  let top = my;
  if (left + mw > window.innerWidth) left = window.innerWidth - mw - 8;
  if (top + mh > window.innerHeight) top = window.innerHeight - mh - 8;
  if (left < 0) left = 8;
  if (top < 0) top = 8;
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
}

function hideContextMenu() {
  const menu = document.getElementById('context-menu');
  if (menu) menu.style.display = 'none';
  _ctxTargetId = null;
}

// 菜单项点击处理
document.getElementById('context-menu').addEventListener('click', (e) => {
  const item = e.target.closest('.ctx-item');
  if (!item || !_ctxTargetId) return;

  const action = item.dataset.action;
  const el = Elements.get(_ctxTargetId);
  if (!el) { hideContextMenu(); return; }

  switch (action) {
    case 'copy': {
      copySelected();
      break;
    }
    case 'paste': {
      pasteClipboard();
      break;
    }
    case 'bring-front': {
      const maxZ = Elements.list.reduce((m, e) => Math.max(m, e.zIndex), 0);
      const oldZ = el.zIndex;
      el.zIndex = maxZ + 1;
      Elements.sortByZIndex();
      History.execute(new UpdateStyleCommand(el, { zIndex: oldZ }, { zIndex: el.zIndex }));
      break;
    }
    case 'send-back': {
      const minZ = Elements.list.reduce((m, e) => Math.min(m, e.zIndex), 0);
      const oldZ = el.zIndex;
      el.zIndex = minZ - 1;
      Elements.sortByZIndex();
      History.execute(new UpdateStyleCommand(el, { zIndex: oldZ }, { zIndex: el.zIndex }));
      break;
    }
    case 'group': {
      if (Renderer.selectedIds.length < 2) break;
      const targets = Renderer.selectedIds.length >= 2
        ? Renderer.selectedIds
        : (el.groupId ? Elements.list.filter(e => e.groupId === el.groupId).map(e => e.id) : [el.id]);
      if (targets.length >= 2) {
        const groupId = Elements.group(targets);
        if (groupId) History.execute(new GroupCommand(targets, groupId));
      }
      break;
    }
    case 'ungroup': {
      const ungroupIds = el.groupId
        ? Elements.list.filter(e => e.groupId === el.groupId).map(e => e.id)
        : [el.id];
      const count = Elements.ungroupElements(ungroupIds);
      if (count > 0) History.execute(new UngroupCommand(ungroupIds));
      break;
    }
    case 'table-add-row': {
      if (el.type === 'table') {
        const cell = getTableCell(el, _ctxWorldPos.x, _ctxWorldPos.y);
        tableAddRow(el, cell ? cell.row : null);
      }
      break;
    }
    case 'table-del-row': {
      if (el.type === 'table') {
        const cell = getTableCell(el, _ctxWorldPos.x, _ctxWorldPos.y);
        if (cell) tableDeleteRow(el, cell.row);
      }
      break;
    }
    case 'table-add-col': {
      if (el.type === 'table') {
        const cell = getTableCell(el, _ctxWorldPos.x, _ctxWorldPos.y);
        tableAddCol(el, cell ? cell.col : null);
      }
      break;
    }
    case 'table-del-col': {
      if (el.type === 'table') {
        const cell = getTableCell(el, _ctxWorldPos.x, _ctxWorldPos.y);
        if (cell) tableDeleteCol(el, cell.col);
      }
      break;
    }
    case 'lock': {
      toggleLock();
      break;
    }
    case 'delete': {
      // 编组元素：删除整个组
      const deleteIds = el.groupId
        ? Elements.list.filter(e => e.groupId === el.groupId).map(e => e.id)
        : [el.id];
      const toDelete = deleteIds.map(id => Elements.get(id)).filter(Boolean);
      const indexed = toDelete.map(el2 => ({ el: el2, index: Elements.list.indexOf(el2) }));
      for (const { el: el2 } of indexed) {
        const idx2 = Elements.list.indexOf(el2);
        if (idx2 !== -1) Elements.list.splice(idx2, 1);
      }
      History.execute(new BatchCommand(indexed.map(({ el: el2, index }) => new DeleteElementCommand(el2, index))));
      Renderer.selectedIds = Renderer.selectedIds.filter(id => !deleteIds.includes(id));
      break;
    }
  }

  Renderer.markDirty();
  UI.updateStatus();
  hideContextMenu();
});

/* ================================================================
 *  尺寸面板
 * ================================================================ */
let _sizePanelRatio = 1;
let _sizePanelLocked = false;
let _sizePanelUpdating = false;
let _sizePanelOrig = null;

function initSizePanel() {
  const inputW = document.getElementById('input-width');
  const inputH = document.getElementById('input-height');
  const lockBtn = document.getElementById('btn-lock-ratio');
  if (!inputW || !inputH || !lockBtn) return;

  function getEl() {
    if (Renderer.selectedIds.length !== 1) return null;
    return Elements.get(Renderer.selectedIds[0]);
  }

  lockBtn.addEventListener('click', () => {
    _sizePanelLocked = !_sizePanelLocked;
    lockBtn.classList.toggle('active', _sizePanelLocked);
    lockBtn.textContent = _sizePanelLocked ? '🔗' : '⛓️‍💥';
    if (_sizePanelLocked) {
      const el = getEl();
      if (el && el.width && el.height) _sizePanelRatio = el.width / el.height;
    }
  });

  inputW.addEventListener('input', () => {
    if (_sizePanelUpdating) return;
    const el = getEl();
    if (!el) return;
    const v = parseFloat(inputW.value);
    if (isNaN(v) || v <= 0) return;
    _sizePanelUpdating = true;
    if (_sizePanelLocked && _sizePanelRatio > 0) inputH.value = Math.round(v / _sizePanelRatio);
    _sizePanelUpdating = false;
    el.width = v;
    if (_sizePanelLocked && _sizePanelRatio > 0) el.height = Math.round(v / _sizePanelRatio);
    Renderer.markDirty();
  });

  inputH.addEventListener('input', () => {
    if (_sizePanelUpdating) return;
    const el = getEl();
    if (!el) return;
    const v = parseFloat(inputH.value);
    if (isNaN(v) || v <= 0) return;
    _sizePanelUpdating = true;
    if (_sizePanelLocked && _sizePanelRatio > 0) inputW.value = Math.round(v * _sizePanelRatio);
    _sizePanelUpdating = false;
    el.height = v;
    if (_sizePanelLocked && _sizePanelRatio > 0) el.width = Math.round(v * _sizePanelRatio);
    Renderer.markDirty();
  });

  function commit() {
    const el = getEl();
    if (!el) return;
    const w = Math.round(parseFloat(inputW.value)) || el.width;
    const h = Math.round(parseFloat(inputH.value)) || el.height;

    // 表格：按比例缩放列宽/行高
    if (el.type === 'table' && el.colWidths && el.rowHeights) {
      const sx = el.width > 0 ? w / el.width : 1;
      const sy = el.height > 0 ? h / el.height : 1;
      el.colWidths = el.colWidths.map(cw => Math.max(20, Math.round(cw * sx)));
      el.rowHeights = el.rowHeights.map(rh => Math.max(20, Math.round(rh * sy)));
      el.width = el.colWidths.reduce((a, b) => a + b, 0);
      el.height = el.rowHeights.reduce((a, b) => a + b, 0);
    }

    el.width = w; el.height = h;
    inputW.value = w; inputH.value = h;
    if (_sizePanelOrig && (_sizePanelOrig.width !== w || _sizePanelOrig.height !== h)) {
      History.execute(new ResizeElementCommand(el,
        { width: _sizePanelOrig.width, height: _sizePanelOrig.height },
        { width: w, height: h }
      ));
    }
    _sizePanelOrig = null;
    Renderer.markDirty();
  }

  inputW.addEventListener('blur', commit);
  inputH.addEventListener('blur', commit);
  inputW.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
  inputH.addEventListener('keydown', (e) => { if (e.key === 'Enter') commit(); });
}

function refreshSizePanel() {
  const panel = document.getElementById('size-panel');
  const inputW = document.getElementById('input-width');
  const inputH = document.getElementById('input-height');
  if (!panel || !inputW || !inputH) return;

  if (Renderer.selectedIds.length !== 1) {
    panel.style.display = 'none';
    return;
  }
  const el = Elements.get(Renderer.selectedIds[0]);
  if (!el || el.type === 'line' || el.type === 'arrow' || el.type === 'path') {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'flex';
  inputW.value = Math.round(el.width || 0);
  inputH.value = Math.round(el.height || 0);
  if (_sizePanelLocked && el.width && el.height) {
    _sizePanelRatio = el.width / el.height;
  }
  _sizePanelOrig = { width: el.width, height: el.height };
}

/* ================================================================
 *  场景 (Scenes)
 * ================================================================ */

/** 保存当前视图为场景 */
function saveScene(name) {
  _scenes.push({
    name: name || ('场景 ' + (_scenes.length + 1)),
    camera: { x: Camera.x, y: Camera.y, zoom: Camera.zoom },
  });
  _currentScene = _scenes.length - 1;
  refreshSceneUI();
  SaveManager.saveToLocal();
}

/** 跳转到指定场景（带动画） */
function goToScene(index) {
  if (index < 0 || index >= _scenes.length) return;
  const s = _scenes[index];
  _currentScene = index;
  refreshSceneUI();

  // 动画过渡
  const startX = Camera.x, startY = Camera.y, startZoom = Camera.zoom;
  const endX = s.camera.x, endY = s.camera.y;
  const endZoom = Math.max(0.1, Math.min(10, s.camera.zoom));
  const duration = 500; // ms
  const startTime = performance.now();

  function animate(now) {
    const elapsed = now - startTime;
    const t = Math.min(1, elapsed / duration);
    // ease-in-out
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    Camera.x = startX + (endX - startX) * ease;
    Camera.y = startY + (endY - startY) * ease;
    Camera.zoom = startZoom + (endZoom - startZoom) * ease;
    Renderer.markDirty();
    UI.updateStatus();
    if (t < 1) {
      requestAnimationFrame(animate);
    }
  }
  requestAnimationFrame(animate);
}

/** 下一个场景 */
function nextScene() {
  if (_scenes.length === 0) return;
  goToScene((_currentScene + 1) % _scenes.length);
}

/** 上一个场景 */
function prevScene() {
  if (_scenes.length === 0) return;
  goToScene((_currentScene - 1 + _scenes.length) % _scenes.length);
}

/** 删除场景 */
function deleteScene(index) {
  if (index < 0 || index >= _scenes.length) return;
  _scenes.splice(index, 1);
  if (_currentScene >= _scenes.length) _currentScene = _scenes.length - 1;
  refreshSceneUI();
  SaveManager.saveToLocal();
}

/** 重命名场景 */
function renameScene(index, name) {
  if (index < 0 || index >= _scenes.length) return;
  _scenes[index].name = name;
  refreshSceneUI();
  SaveManager.saveToLocal();
}

/** 刷新场景 UI */
function refreshSceneUI() {
  const label = document.getElementById('scene-label');
  if (!label) return;
  if (_scenes.length === 0) {
    label.textContent = '无场景';
  } else {
    const idx = Math.max(0, _currentScene);
    label.textContent = (idx + 1) + '/' + _scenes.length + ' ' + _scenes[idx].name;
  }
  // 面板打开时同步刷新
  if (_scenePanelOpen) renderScenePanel();
}

/** 初始化场景 UI */
function initSceneUI() {
  document.getElementById('btn-present-mode').addEventListener('click', togglePresentMode);
  document.getElementById('btn-scene-prev').addEventListener('click', prevScene);
  document.getElementById('btn-scene-next').addEventListener('click', nextScene);
  document.getElementById('btn-scene-add').addEventListener('click', () => {
    const name = prompt('场景名称:', '场景 ' + (_scenes.length + 1));
    if (name !== null) saveScene(name || undefined);
  });
  // 单击标签打开场景管理面板
  document.getElementById('scene-label').addEventListener('click', () => {
    toggleScenePanel();
  });
  refreshSceneUI();
  initScenePanel();
}

/* ================================================================
 *  场景管理面板
 * ================================================================ */
function toggleScenePanel() {
  _scenePanelOpen = !_scenePanelOpen;
  const panel = document.getElementById('scene-panel');
  if (!panel) return;
  if (_scenePanelOpen) {
    _scenePanelSelected.clear();
    panel.style.display = 'flex';
    renderScenePanel();
  } else {
    panel.style.display = 'none';
  }
}

function closeScenePanel() {
  _scenePanelOpen = false;
  const panel = document.getElementById('scene-panel');
  if (panel) panel.style.display = 'none';
}

function initScenePanel() {
  // 关闭按钮
  document.getElementById('scene-panel-close').addEventListener('click', closeScenePanel);

  // 全选按钮
  document.getElementById('scene-panel-select-all').addEventListener('click', () => {
    if (_scenePanelSelected.size === _scenes.length) {
      _scenePanelSelected.clear();
    } else {
      for (let i = 0; i < _scenes.length; i++) _scenePanelSelected.add(i);
    }
    renderScenePanel();
  });

  // 删除选中按钮
  document.getElementById('scene-panel-delete').addEventListener('click', () => {
    if (_scenePanelSelected.size === 0) return;
    const count = _scenePanelSelected.size;
    if (!confirm('确定删除选中的 ' + count + ' 个场景？')) return;
    deleteSelectedScenes();
  });

  // 添加场景按钮
  document.getElementById('scene-panel-add').addEventListener('click', () => {
    const name = prompt('场景名称:', '场景 ' + (_scenes.length + 1));
    if (name !== null) saveScene(name || undefined);
  });

  // 跳转到指定场景
  const jumpInput = document.getElementById('scene-jump-input');
  const jumpBtn = document.getElementById('scene-jump-btn');
  const doJump = () => {
    const val = parseInt(jumpInput.value);
    if (isNaN(val) || val < 1 || val > _scenes.length) {
      jumpInput.style.borderColor = 'var(--danger)';
      setTimeout(() => { jumpInput.style.borderColor = ''; }, 800);
      return;
    }
    goToScene(val - 1);
    jumpInput.value = '';
    renderScenePanel();
  };
  jumpBtn.addEventListener('click', doJump);
  jumpInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doJump();
  });

  // 点击面板外部关闭
  document.addEventListener('mousedown', (e) => {
    if (!_scenePanelOpen) return;
    const panel = document.getElementById('scene-panel');
    const sceneBar = document.getElementById('scene-bar');
    if (panel && !panel.contains(e.target) && !sceneBar.contains(e.target)) {
      closeScenePanel();
    }
  });

  // Esc 关闭面板
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && _scenePanelOpen) {
      closeScenePanel();
      e.preventDefault();
    }
  });

  // 文件操作下拉菜单
  const fileBtn = document.getElementById('scene-panel-file-btn');
  const fileDropdown = document.getElementById('scene-panel-file-dropdown');
  if (fileBtn && fileDropdown) {
    fileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fileDropdown.style.display = fileDropdown.style.display === 'none' ? 'block' : 'none';
    });
    // 点击外部关闭下拉菜单
    document.addEventListener('click', (e) => {
      if (!fileBtn.contains(e.target) && !fileDropdown.contains(e.target)) {
        fileDropdown.style.display = 'none';
      }
    });
    // 菜单项点击
    fileDropdown.querySelectorAll('.scene-panel-file-item').forEach(item => {
      item.addEventListener('click', () => {
        const action = item.dataset.action;
        fileDropdown.style.display = 'none';
        if (action === 'save') {
          SaveManager.saveToFile();
        } else if (action === 'load') {
          const input = document.getElementById('input-load-file');
          if (input) input.click();
        }
      });
    });
  }
}

function renderScenePanel() {
  const list = document.getElementById('scene-panel-list');
  if (!list) return;

  if (_scenes.length === 0) {
    list.innerHTML = '<div class="scene-panel-empty">暂无场景<br><br>点击底部按钮或按<br>Ctrl+Shift+S 添加场景</div>';
    return;
  }

  list.innerHTML = '';
  for (let i = 0; i < _scenes.length; i++) {
    const scene = _scenes[i];
    const item = document.createElement('div');
    item.className = 'scene-item';
    if (i === _currentScene) item.classList.add('current');
    if (_scenePanelSelected.has(i)) item.classList.add('selected');
    item.dataset.index = i;
    item.draggable = true;

    item.innerHTML =
      '<span class="scene-item-grip" title="拖拽排序">⠿</span>' +
      '<span class="scene-item-check">✓</span>' +
      '<div class="scene-item-info">' +
        '<div class="scene-item-name">' + escapeHtml(scene.name) + '</div>' +
        '<div class="scene-item-index">第 ' + (i + 1) + ' 页</div>' +
      '</div>' +
      '<span class="scene-item-dot"></span>';

    // 单击：选中/取消选中（多选）
    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('scene-item-grip')) return; // 拖拽手柄不触发
      const idx = parseInt(item.dataset.index);
      if (e.ctrlKey || e.metaKey) {
        // Ctrl+Click: 多选切换
        if (_scenePanelSelected.has(idx)) _scenePanelSelected.delete(idx);
        else _scenePanelSelected.add(idx);
      } else if (e.shiftKey && _scenePanelSelected.size > 0) {
        // Shift+Click: 范围选中
        const lastSelected = Math.max(..._scenePanelSelected);
        const from = Math.min(lastSelected, idx);
        const to = Math.max(lastSelected, idx);
        for (let j = from; j <= to; j++) _scenePanelSelected.add(j);
      } else {
        // 普通点击：跳转场景并清除多选
        _scenePanelSelected.clear();
        goToScene(idx);
      }
      renderScenePanel();
    });

    // 双击：重命名
    item.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('scene-item-grip')) return;
      const idx = parseInt(item.dataset.index);
      const name = prompt('重命名场景:', _scenes[idx].name);
      if (name !== null && name.trim()) renameScene(idx, name.trim());
      renderScenePanel();
    });

    // 右键：删除
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      const idx = parseInt(item.dataset.index);
      if (confirm('删除场景「' + _scenes[idx].name + '」？')) {
        deleteScene(idx);
        _scenePanelSelected.delete(idx);
        // 调整其他选中索引
        const newSelected = new Set();
        for (const si of _scenePanelSelected) {
          newSelected.add(si > idx ? si - 1 : si);
        }
        _scenePanelSelected = newSelected;
        renderScenePanel();
      }
    });

    // --- 拖拽排序 ---
    item.addEventListener('dragstart', (e) => {
      _scenePanelDragIdx = parseInt(item.dataset.index);
      item.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(_scenePanelDragIdx));
    });

    item.addEventListener('dragend', () => {
      item.classList.remove('dragging');
      _scenePanelDragIdx = -1;
      // 清除所有拖拽状态样式
      list.querySelectorAll('.scene-item').forEach(el => {
        el.classList.remove('drag-over', 'drag-over-below');
      });
    });

    item.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const targetIdx = parseInt(item.dataset.index);
      if (targetIdx === _scenePanelDragIdx) return;
      // 判断插入位置
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      item.classList.remove('drag-over', 'drag-over-below');
      if (e.clientY < midY) {
        item.classList.add('drag-over');
      } else {
        item.classList.add('drag-over-below');
      }
    });

    item.addEventListener('dragleave', () => {
      item.classList.remove('drag-over', 'drag-over-below');
    });

    item.addEventListener('drop', (e) => {
      e.preventDefault();
      const fromIdx = _scenePanelDragIdx;
      const targetIdx = parseInt(item.dataset.index);
      if (fromIdx < 0 || fromIdx === targetIdx) return;

      // 判断插入方向
      const rect = item.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const insertAfter = e.clientY >= midY;

      reorderScene(fromIdx, targetIdx, insertAfter);

      item.classList.remove('drag-over', 'drag-over-below');
      // 更新选中索引
      _scenePanelSelected.clear();
      renderScenePanel();
    });

    list.appendChild(item);
  }
}

/** 重新排序场景 */
function reorderScene(fromIdx, toIdx, insertAfter) {
  if (fromIdx < 0 || fromIdx >= _scenes.length) return;
  if (toIdx < 0 || toIdx >= _scenes.length) return;

  const scene = _scenes.splice(fromIdx, 1)[0];

  // 计算实际插入位置
  let insertIdx = toIdx;
  if (fromIdx < toIdx) insertIdx--; // 因为已移除前面的元素
  if (insertAfter) insertIdx++;

  insertIdx = Math.max(0, Math.min(insertIdx, _scenes.length));
  _scenes.splice(insertIdx, 0, scene);

  // 更新当前场景索引
  if (_currentScene === fromIdx) {
    _currentScene = insertIdx;
  } else if (fromIdx < _currentScene && insertIdx >= _currentScene) {
    _currentScene--;
  } else if (fromIdx > _currentScene && insertIdx <= _currentScene) {
    _currentScene++;
  }

  refreshSceneUI();
  SaveManager.saveToLocal();
}

/** 删除选中的场景 */
function deleteSelectedScenes() {
  if (_scenePanelSelected.size === 0) return;
  const indices = Array.from(_scenePanelSelected).sort((a, b) => b - a); // 从大到小删除
  for (const idx of indices) {
    if (idx >= 0 && idx < _scenes.length) {
      _scenes.splice(idx, 1);
    }
  }
  // 更新当前场景索引
  if (_currentScene >= _scenes.length) _currentScene = _scenes.length - 1;
  _scenePanelSelected.clear();
  refreshSceneUI();
  renderScenePanel();
  SaveManager.saveToLocal();
}

/** HTML 转义 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/* ================================================================
 *  演讲模式
 * ================================================================ */
function togglePresentMode() {
  _presentMode = !_presentMode;
  ['toolbar', 'statusbar', 'size-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = _presentMode ? 'none' : '';
  });
  // 演讲模式隐藏场景管理面板
  if (_presentMode) closeScenePanel();
  // 场景栏保留播放按钮
  const sceneBar = document.getElementById('scene-bar');
  const presentBtn = document.getElementById('btn-present-mode');
  if (sceneBar) {
    document.getElementById('btn-scene-prev').style.display = _presentMode ? 'none' : '';
    document.getElementById('btn-scene-next').style.display = _presentMode ? 'none' : '';
    document.getElementById('btn-scene-add').style.display = _presentMode ? 'none' : '';
    document.getElementById('scene-label').style.display = _presentMode ? 'none' : '';
  }
  if (presentBtn) {
    presentBtn.innerHTML = _presentMode
      ? '<svg viewBox="0 0 24 24" width="14" height="14"><rect x="5" y="3" width="5" height="18" fill="currentColor"/><rect x="14" y="3" width="5" height="18" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 24 24" width="14" height="14"><polygon points="6,3 20,12 6,21" fill="currentColor"/></svg>';
    presentBtn.title = _presentMode ? '退出演讲 (Esc)' : '演讲模式 (Ctrl+Shift+P)';
  }
  document.getElementById('main-canvas').style.cursor = _presentMode ? 'none' : '';
  if (_presentMode && _scenes.length > 0 && _currentScene < 0) {
    goToScene(0);
  }
}

document.addEventListener('keydown', (e) => {
  if (!_presentMode) return;
  if (e.key === 'Escape') { togglePresentMode(); e.preventDefault(); return; }
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { nextScene(); e.preventDefault(); }
  if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { prevScene(); e.preventDefault(); }
});

document.addEventListener('click', (e) => {
  if (!_presentMode) return;
  if (e.target.id === 'main-canvas') nextScene();
});

/* ================================================================
 *  示例元素（首次加载时添加）
 * ================================================================ */
function addWelcomeElements() {
  const sticky = Elements.create('sticky-note', {
    x: -150, y: -80,
    width: 300, height: 160,
    text: '欢迎使用 无边记 🎨\n\n点击左侧工具栏开始创作\n• V 选择  • P 画笔\n• R 矩形  • T 文本\n• H 抓手  • N 便签',
    fontSize: 16,
    fillColor: '#fff9c4',
    strokeColor: '#e6c200',
    strokeWidth: 1,
  });
  Elements.list.push(sticky);

  const rect = Elements.create('rectangle', {
    x: 200, y: -50,
    width: 150, height: 100,
    fillColor: '#007aff33',
    strokeColor: '#007aff',
    strokeWidth: 2,
  });
  Elements.list.push(rect);

  const ellipse = Elements.create('ellipse', {
    x: -200, y: -50,
    width: 120, height: 120,
    fillColor: '#ff950033',
    strokeColor: '#ff9500',
    strokeWidth: 2,
  });
  Elements.list.push(ellipse);

  History.clear(); // 不把初始元素放入历史
}
