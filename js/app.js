/* === 无边记 — 主应用 === */

/** 全局应用状态 */
const appState = {
  fillColor: '#ffffff',
  strokeColor: '#000000',
  strokeWidth: 2,
  fontSize: 20,
};

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
      elements: Elements.list
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

  // 4. 如果没有已保存数据，添加欢迎元素
  if (!loaded) {
    Camera.x = cw / 2;
    Camera.y = ch / 2;
    addWelcomeElements();
    SaveManager.saveToLocal();
  }

  // 5. 初始化 UI
  UI.init();

  // 6. 绑定事件
  bindCanvasEvents();

  // 7. 启动渲染循环
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

  // 如果没有选中该元素，先选中它
  if (!Renderer.selectedIds.includes(hit.id)) {
    Renderer.selectedIds = [hit.id];
    Renderer.markDirty();
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

  const rect = Elements.create('rectangle', {
    x: 200, y: -50,
    width: 150, height: 100,
    fillColor: '#007aff33',
    strokeColor: '#007aff',
    strokeWidth: 2,
  });

  const ellipse = Elements.create('ellipse', {
    x: -200, y: -50,
    width: 120, height: 120,
    fillColor: '#ff950033',
    strokeColor: '#ff9500',
    strokeWidth: 2,
  });

  History.clear(); // 不把初始元素放入历史
}
