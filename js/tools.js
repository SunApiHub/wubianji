/* === 无边记 — 工具系统 === */

const Tools = {
  current: 'select',   // 当前工具名称
  _tools: {},           // 工具实例注册表

  /** 注册工具 */
  register(name, impl) {
    this._tools[name] = impl;
  },

  /** 切换到指定工具 */
  switchTo(name) {
    if (this._tools[this.current] && this._tools[this.current].deactivate) {
      this._tools[this.current].deactivate();
    }
    this.current = name;
    if (this._tools[name] && this._tools[name].activate) {
      this._tools[name].activate();
    }
    Renderer.markDirty();
  },

  /** 获取当前工具实例 */
  _current() { return this._tools[this.current]; },

  // 事件委托
  onMouseDown(sx, sy, e) { this._current()?.onMouseDown?.(sx, sy, e); },
  onMouseMove(sx, sy, e) { this._current()?.onMouseMove?.(sx, sy, e); },
  onMouseUp(sx, sy, e)   { this._current()?.onMouseUp?.(sx, sy, e); },
  onDblClick(sx, sy, e)  { this._current()?.onDblClick?.(sx, sy, e); },
  onKeyDown(e)           { this._current()?.onKeyDown?.(e); },
  onTouchStart(sx, sy, e){ this._current()?.onTouchStart?.(sx, sy, e); },
  onTouchMove(sx, sy, e) { this._current()?.onTouchMove?.(sx, sy, e); },
  onTouchEnd(sx, sy, e)  { this._current()?.onTouchEnd?.(sx, sy, e); },
};

/* ================================================================
 *  选择工具 (select)
 * ================================================================ */
Tools.register('select', {
  name: 'select',
  cursor: 'default',

  // 状态
  dragging: false,
  dragStartWX: 0, dragStartWY: 0,
  dragOrigPositions: [],  // 移动前各元素位置快照
  resizing: false,
  resizeHandle: null,
  resizeOrig: null,       // 缩放前元素属性快照
  rotating: false,
  rotateStartAngle: 0,
  rotateOrig: 0,
  boxSelecting: false,
  boxSelectStart: null,

  activate() {
    this.reset();
  },

  deactivate() {
    if (!this.dragging && !this.boxSelecting) {
      Renderer.selectedIds = [];
    }
    this.reset();
  },

  reset() {
    this.dragging = false;
    this.resizing = false;
    this.rotating = false;
    this.boxSelecting = false;
    this.resizeHandle = null;
    this.resizeOrig = null;
    this.dragOrigPositions = [];
    Renderer.selectionBox = null;
    Renderer.guides = [];
  },

  onMouseDown(sx, sy, e) {
    const w = Camera.screenToWorld(sx, sy);

    // 检查是否点击了已有选中元素的手柄
    for (const id of Renderer.selectedIds) {
      const el = Elements.get(id);
      if (!el) continue;
      const handle = Renderer.hitTestHandle(el, sx, sy);
      if (handle === 'rotate') {
        this.rotating = true;
        this.rotateTarget = el;
        this.rotateOrig = el.rotation || 0;
        const b = Elements.getBounds(el);
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2;
        this.rotateCenter = { x: cx, y: cy };
        this.rotateStartAngle = Math.atan2(w.y - cy, w.x - cx);
        return;
      }
      if (handle) {
        this.resizing = true;
        this.resizeHandle = handle;
        this.resizeTarget = el;
        this.resizeOrig = {
          x: el.x, y: el.y, width: el.width, height: el.height,
          endX: el.endX, endY: el.endY
        };
        return;
      }
    }

    // 检查是否点击了某个元素
    const hit = Elements.hitTest(w.x, w.y);
    if (hit) {
      // 编组支持：点击编组内任一元素，全选整个组
      const targets = hit.groupId
        ? Elements.list.filter(e => e.groupId === hit.groupId)
        : [hit];

      if (e.shiftKey) {
        // Shift+点击：多选切换
        for (const t of targets) {
          const idx = Renderer.selectedIds.indexOf(t.id);
          if (idx !== -1) {
            Renderer.selectedIds.splice(idx, 1);
          } else {
            Renderer.selectedIds.push(t.id);
          }
        }
      } else if (!targets.some(t => Renderer.selectedIds.includes(t.id))) {
        Renderer.selectedIds = targets.map(t => t.id);
      }

      // 开始拖拽移动
      this.dragging = true;
      this.dragStartWX = w.x;
      this.dragStartWY = w.y;
      this.dragOrigPositions = Renderer.selectedIds.map(id => {
        const el = Elements.get(id);
        return el ? { id: el.id, x: el.x, y: el.y, endX: el.endX, endY: el.endY } : null;
      }).filter(Boolean);
      return;
    }

    // 点击空白：开始框选或取消选中
    if (!e.shiftKey) {
      Renderer.selectedIds = [];
    }
    this.boxSelecting = true;
    this.boxSelectStart = { x: w.x, y: w.y };
    Renderer.selectionBox = { x1: w.x, y1: w.y, x2: w.x, y2: w.y };
  },

  onMouseMove(sx, sy, e) {
    const w = Camera.screenToWorld(sx, sy);

    // 光标样式
    if (!this.dragging && !this.resizing && !this.rotating && !this.boxSelecting) {
      let newCursor = 'default';
      for (const id of Renderer.selectedIds) {
        const el = Elements.get(id);
        if (!el) continue;
        const h = Renderer.hitTestHandle(el, sx, sy);
        if (h === 'rotate') { newCursor = 'crosshair'; break; }
        if (h) {
          const cursors = { nw: 'nwse-resize', se: 'nwse-resize', ne: 'nesw-resize', sw: 'nesw-resize', n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize' };
          newCursor = cursors[h] || 'default';
          break;
        }
      }
      if (newCursor === 'default') {
        const hit = Elements.hitTest(w.x, w.y);
        if (hit) newCursor = 'move';
      }
      document.getElementById('main-canvas').style.cursor = newCursor;
    }

    if (this.dragging) {
      const dx = w.x - this.dragStartWX;
      const dy = w.y - this.dragStartWY;

      // 计算对齐参考线（仅显示，不吸附）
      const snap = this._calcSnap(dx, dy);
      Renderer.guides = snap ? snap.guides : [];

      for (const orig of this.dragOrigPositions) {
        const el = Elements.get(orig.id);
        if (!el) continue;
        el.x = orig.x + dx;
        el.y = orig.y + dy;
        if (orig.endX !== undefined) {
          el.endX = orig.endX + dx;
          el.endY = orig.endY + dy;
        }
      }
      Renderer.markDirty();
    }

    if (this.resizing) {
      this._resize(w.x, w.y);
    }

    if (this.rotating) {
      const angle = Math.atan2(w.y - this.rotateCenter.y, w.x - this.rotateCenter.x);
      let delta = (angle - this.rotateStartAngle) * 180 / Math.PI;
      if (e.shiftKey) delta = Math.round(delta / 15) * 15; // 15度吸附
      this.rotateTarget.rotation = this.rotateOrig + delta;
      Renderer.markDirty();
    }

    if (this.boxSelecting) {
      Renderer.selectionBox = {
        x1: this.boxSelectStart.x,
        y1: this.boxSelectStart.y,
        x2: w.x,
        y2: w.y
      };
      Renderer.markDirty();
    }
  },

  onMouseUp(sx, sy, e) {
    if (this.dragging) {
      // 记录移动命令
      const commands = [];
      for (const orig of this.dragOrigPositions) {
        const el = Elements.get(orig.id);
        if (!el) continue;
        if (el.x !== orig.x || el.y !== orig.y ||
            el.endX !== orig.endX || el.endY !== orig.endY) {
          commands.push(new MoveElementCommand(
            el, orig.x, orig.y, el.x, el.y,
            orig.endX, orig.endY, el.endX, el.endY
          ));
        }
      }
      if (commands.length === 1) {
        History.execute(commands[0]);
      } else if (commands.length > 1) {
        History.execute(new BatchCommand(commands));
      }
    }

    if (this.resizing && this.resizeTarget && this.resizeOrig) {
      const el = this.resizeTarget;
      const isLine = el.type === 'line' || el.type === 'arrow';
      const oldProps = { x: this.resizeOrig.x, y: this.resizeOrig.y, width: this.resizeOrig.width, height: this.resizeOrig.height };
      const newProps = { x: el.x, y: el.y, width: el.width, height: el.height };
      if (isLine && this.resizeOrig.endX !== undefined) {
        oldProps.endX = this.resizeOrig.endX;
        oldProps.endY = this.resizeOrig.endY;
        newProps.endX = el.endX;
        newProps.endY = el.endY;
      }
      if (JSON.stringify(oldProps) !== JSON.stringify(newProps)) {
        History.execute(new ResizeElementCommand(el, oldProps, newProps));
      }
    }

    if (this.rotating && this.rotateTarget) {
      const el = this.rotateTarget;
      if (el.rotation !== this.rotateOrig) {
        History.execute(new UpdateStyleCommand(el,
          { rotation: this.rotateOrig },
          { rotation: el.rotation }
        ));
      }
    }

    if (this.boxSelecting && this.boxSelectStart) {
      const w = Camera.screenToWorld(sx, sy);
      const hits = Elements.hitTestRect(this.boxSelectStart.x, this.boxSelectStart.y, w.x, w.y);
      if (e.shiftKey) {
        // 添加到现有选中
        for (const el of hits) {
          if (!Renderer.selectedIds.includes(el.id)) {
            Renderer.selectedIds.push(el.id);
          }
        }
      } else {
        Renderer.selectedIds = hits.map(el => el.id);
      }
      Renderer.selectionBox = null;
    }

    this.reset();
    Renderer.markDirty();
    document.getElementById('main-canvas').style.cursor = 'default';
  },

  _resize(wx, wy) {
    const el = this.resizeTarget;
    const o = this.resizeOrig;
    const h = this.resizeHandle;

    let { x, y, width, height } = { x: o.x, y: o.y, width: o.width, height: o.height };
    const minSize = 5;

    switch (h) {
      case 'nw': x = wx; y = wy; width = o.x + o.width - wx; height = o.y + o.height - wy; break;
      case 'n':  y = wy; height = o.y + o.height - wy; break;
      case 'ne': y = wy; width = wx - o.x; height = o.y + o.height - wy; break;
      case 'e':  width = wx - o.x; break;
      case 'se': width = wx - o.x; height = wy - o.y; break;
      case 's':  height = wy - o.y; break;
      case 'sw': x = wx; width = o.x + o.width - wx; height = wy - o.y; break;
      case 'w':  x = wx; width = o.x + o.width - wx; break;
    }

    // Shift 等比缩放
    if (window._shiftKey) {
      const ratio = o.width / o.height;
      switch (h) {
        case 'nw': case 'se': { const w2 = Math.max(Math.abs(width), Math.abs(height) * ratio) * Math.sign(width); width = w2; height = w2 / ratio; break; }
        case 'ne': case 'sw': { const w2 = Math.max(Math.abs(width), Math.abs(height) * ratio) * Math.sign(width); width = w2; height = -w2 / ratio; break; }
        case 'n': case 's': width = height * ratio; break;
        case 'e': case 'w': height = width / ratio; break;
      }
    }

    // 最小尺寸限制
    if (width < minSize) { width = minSize; if (h.includes('w')) x = o.x + o.width - minSize; }
    if (height < minSize) { height = minSize; if (h.includes('n')) y = o.y + o.height - minSize; }

    // 直线/箭头：同步更新端点坐标
    if ((el.type === 'line' || el.type === 'arrow') && o.endX !== undefined) {
      const origVecX = o.endX - o.x;
      const origVecY = o.endY - o.y;
      const scaleX = o.width > 0 ? width / o.width : 1;
      const scaleY = o.height > 0 ? height / o.height : 1;
      el.x = x;
      el.y = y;
      el.endX = el.x + origVecX * scaleX;
      el.endY = el.y + origVecY * scaleY;
    } else {
      el.x = x;
      el.y = y;
    }
    el.width = width;
    el.height = height;

    Renderer.markDirty();
  },

  /** 计算对齐参考线（仅显示，不吸附） */
  _calcSnap(rawDx, rawDy) {
    const threshold = 5 / Camera.zoom;
    const draggedIds = new Set(this.dragOrigPositions.map(o => o.id));

    // 计算拖拽元素新位置的联合包围盒
    let dMinX = Infinity, dMinY = Infinity, dMaxX = -Infinity, dMaxY = -Infinity;
    for (const orig of this.dragOrigPositions) {
      const el = Elements.get(orig.id);
      if (!el) continue;
      const b = Elements.getBounds(el);
      const nx = b.x + rawDx, ny = b.y + rawDy;
      dMinX = Math.min(dMinX, nx);
      dMinY = Math.min(dMinY, ny);
      dMaxX = Math.max(dMaxX, nx + b.width);
      dMaxY = Math.max(dMaxY, ny + b.height);
    }
    const dCx = (dMinX + dMaxX) / 2;
    const dCy = (dMinY + dMaxY) / 2;

    // 收集所有其他元素的边
    const edges = { left: [], right: [], top: [], bottom: [], cx: [], cy: [] };
    for (const el of Elements.list) {
      if (draggedIds.has(el.id)) continue;
      const b = Elements.getBounds(el);
      edges.left.push(b.minX);
      edges.right.push(b.maxX);
      edges.top.push(b.minY);
      edges.bottom.push(b.maxY);
      edges.cx.push(b.minX + b.width / 2);
      edges.cy.push(b.minY + b.height / 2);
    }

    const checks = [
      { dragPos: dMinX, pool: 'left',   type: 'v' },
      { dragPos: dMaxX, pool: 'right',  type: 'v' },
      { dragPos: dCx,   pool: 'cx',     type: 'v' },
      { dragPos: dMinY, pool: 'top',    type: 'h' },
      { dragPos: dMaxY, pool: 'bottom', type: 'h' },
      { dragPos: dCy,   pool: 'cy',     type: 'h' },
    ];

    const guides = [];
    for (const check of checks) {
      const pool = edges[check.pool];
      let closest = null, closestDist = threshold;
      for (const e of pool) {
        const dist = Math.abs(check.dragPos - e);
        if (dist < closestDist) { closestDist = dist; closest = e; }
      }
      if (closest !== null) {
        guides.push({ type: check.type, pos: closest });
      }
    }

    // 去重 + 扩展参考线到画布可视范围
    if (guides.length === 0) return null;

    const tl = Camera.screenToWorld(0, 0);
    const br = Camera.screenToWorld(window.innerWidth, window.innerHeight);
    const seen = new Set();
    const unique = [];
    for (const g of guides) {
      const key = g.type + ':' + g.pos.toFixed(2);
      if (seen.has(key)) continue;
      seen.add(key);
      g.startX = tl.x; g.endX = br.x;
      g.startY = tl.y; g.endY = br.y;
      unique.push(g);
    }
    return { guides: unique };
  },

  onDblClick(sx, sy, e) {
    const w = Camera.screenToWorld(sx, sy);
    const hit = Elements.hitTest(w.x, w.y);
    if (hit && (hit.type === 'text' || hit.type === 'sticky-note')) {
      Tools.switchTo('text');
      Tools._tools['text'].startEditing(hit);
    }
  }
});


/* ================================================================
 *  画笔工具 (pen)
 * ================================================================ */
Tools.register('pen', {
  name: 'pen',
  cursor: 'crosshair',
  drawing: false,
  points: [],

  activate() { this.points = []; this.drawing = false; },
  deactivate() { this._finishPath(); },

  onMouseDown(sx, sy, e) {
    this.drawing = true;
    this.points = [];
    const w = Camera.screenToWorld(sx, sy);
    this.points.push({ x: w.x, y: w.y });
    Renderer.preview = null;
  },

  onMouseMove(sx, sy, e) {
    if (!this.drawing) return;
    const w = Camera.screenToWorld(sx, sy);
    this.points.push({ x: w.x, y: w.y });
    Renderer.preview = {
      type: 'path',
      points: this.points,
      strokeColor: appState.strokeColor,
      strokeWidth: appState.strokeWidth
    };
    Renderer.markDirty();
  },

  onMouseUp(sx, sy, e) {
    if (!this.drawing) return;
    this.drawing = false;
    const w = Camera.screenToWorld(sx, sy);
    this.points.push({ x: w.x, y: w.y });
    this._finishPath();
  },

  _finishPath() {
    Renderer.preview = null;
    if (this.points.length < 2) { this.points = []; return; }

    // 简化路径：移除太近的点
    const simplified = [this.points[0]];
    for (let i = 1; i < this.points.length; i++) {
      const last = simplified[simplified.length - 1];
      const dx = this.points[i].x - last.x;
      const dy = this.points[i].y - last.y;
      if (dx * dx + dy * dy > 2) { // 最小距离阈值
        simplified.push(this.points[i]);
      }
    }
    if (simplified.length < 2) { this.points = []; return; }

    const b = this._calcBounds(simplified);
    const el = Elements.create('path', {
      points: simplified,
      x: b.x, y: b.y,
      width: b.width, height: b.height,
      strokeColor: appState.strokeColor,
      strokeWidth: appState.strokeWidth,
      fillColor: 'transparent'
    });
    History.execute(new AddElementCommand(el));
    Renderer.selectedIds = [el.id];
    this.points = [];
    Renderer.markDirty();
  },

  _calcBounds(points) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
    }
    return { x: minX, y: minY, width: Math.max(maxX - minX, 1), height: Math.max(maxY - minY, 1) };
  }
});


/* ================================================================
 *  形状工具 (rectangle, ellipse, line, arrow)
 * ================================================================ */
function makeShapeTool(type, cursor) {
  return {
    name: type,
    cursor: cursor,
    drawing: false,
    startWX: 0, startWY: 0,

    activate() { this.drawing = false; Renderer.preview = null; },
    deactivate() { Renderer.preview = null; Renderer.markDirty(); },

    onMouseDown(sx, sy, e) {
      this.drawing = true;
      const w = Camera.screenToWorld(sx, sy);
      this.startWX = w.x;
      this.startWY = w.y;
    },

    onMouseMove(sx, sy, e) {
      if (!this.drawing) return;
      const w = Camera.screenToWorld(sx, sy);
      let endX = w.x;
      let endY = w.y;

      // Shift 约束
      if (e.shiftKey) {
        const dx = Math.abs(endX - this.startWX);
        const dy = Math.abs(endY - this.startWY);
        if (type === 'line' || type === 'arrow') {
          const angle = Math.atan2(Math.abs(endY - this.startWY), Math.abs(endX - this.startWX));
          const snapAngles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4];
          let best = 0;
          let bestDiff = Infinity;
          for (const a of snapAngles) {
            const diff = Math.abs(angle - a);
            if (diff < bestDiff) { bestDiff = diff; best = a; }
          }
          const len = Math.sqrt(dx*dx + dy*dy);
          endX = this.startWX + len * Math.cos(best) * Math.sign(endX - this.startWX);
          endY = this.startWY + len * Math.sin(best) * Math.sign(endY - this.startWY);
        } else {
          const size = Math.max(dx, dy);
          endX = this.startWX + size * Math.sign(endX - this.startWX);
          endY = this.startWY + size * Math.sign(endY - this.startWY);
        }
      }

      if (type === 'line' || type === 'arrow') {
        Renderer.preview = {
          type, x: this.startWX, y: this.startWY,
          endX, endY,
          strokeColor: appState.strokeColor,
          strokeWidth: appState.strokeWidth
        };
      } else {
        const x = Math.min(this.startWX, endX);
        const y = Math.min(this.startWY, endY);
        const width = Math.abs(endX - this.startWX);
        const height = Math.abs(endY - this.startWY);
        Renderer.preview = {
          type, x, y, width, height,
          fillColor: type === 'sticky-note' ? '#fff9c4' : appState.fillColor,
          strokeColor: appState.strokeColor,
          strokeWidth: appState.strokeWidth
        };
      }
      Renderer.markDirty();
    },

    onMouseUp(sx, sy, e) {
      if (!this.drawing) return;
      this.drawing = false;
      const w = Camera.screenToWorld(sx, sy);
      let endX = w.x;
      let endY = w.y;

      if (e.shiftKey) {
        const dx = Math.abs(endX - this.startWX);
        const dy = Math.abs(endY - this.startWY);
        if (type === 'line' || type === 'arrow') {
          const angle = Math.atan2(Math.abs(endY - this.startWY), Math.abs(endX - this.startWX));
          const snapAngles = [0, Math.PI/4, Math.PI/2, 3*Math.PI/4];
          let best = 0, bestDiff = Infinity;
          for (const a of snapAngles) {
            const diff = Math.abs(angle - a);
            if (diff < bestDiff) { bestDiff = diff; best = a; }
          }
          const len = Math.sqrt(dx*dx + dy*dy);
          endX = this.startWX + len * Math.cos(best) * Math.sign(endX - this.startWX);
          endY = this.startWY + len * Math.sin(best) * Math.sign(endY - this.startWY);
        } else {
          const size = Math.max(dx, dy);
          endX = this.startWX + size * Math.sign(endX - this.startWX);
          endY = this.startWY + size * Math.sign(endY - this.startWY);
        }
      }

      Renderer.preview = null;

      if (type === 'line' || type === 'arrow') {
        const dx = endX - this.startWX;
        const dy = endY - this.startWY;
        if (dx * dx + dy * dy < 4) return; // 太短忽略
        const el = Elements.create(type, {
          x: this.startWX, y: this.startWY,
          endX, endY,
          width: Math.abs(endX - this.startWX),
          height: Math.abs(endY - this.startWY),
          fillColor: 'transparent',
          strokeColor: appState.strokeColor,
          strokeWidth: appState.strokeWidth
        });
        History.execute(new AddElementCommand(el));
        Renderer.selectedIds = [el.id];
      } else {
        const x = Math.min(this.startWX, endX);
        const y = Math.min(this.startWY, endY);
        const width = Math.abs(endX - this.startWX);
        const height = Math.abs(endY - this.startWY);
        if (width < 3 || height < 3) return;
        const el = Elements.create(type, {
          x, y, width, height,
          fillColor: appState.fillColor,
          strokeColor: appState.strokeColor,
          strokeWidth: appState.strokeWidth
        });
        History.execute(new AddElementCommand(el));
        Renderer.selectedIds = [el.id];
      }
      Renderer.markDirty();
    }
  };
}

Tools.register('rectangle', makeShapeTool('rectangle', 'crosshair'));
Tools.register('ellipse', makeShapeTool('ellipse', 'crosshair'));
Tools.register('line', makeShapeTool('line', 'crosshair'));
Tools.register('arrow', makeShapeTool('arrow', 'crosshair'));


/* ================================================================
 *  文本工具 (text)
 * ================================================================ */
Tools.register('text', {
  name: 'text',
  cursor: 'text',
  editingEl: null,  // 正在编辑的元素

  activate() { this.editingEl = null; },
  deactivate() { this._commitEditing(); },

  onMouseDown(sx, sy, e) {
    const w = Camera.screenToWorld(sx, sy);
    // 先提交之前的编辑
    this._commitEditing();

    // 检查是否点击了已有文本/便签
    const hit = Elements.hitTest(w.x, w.y);
    if (hit && (hit.type === 'text' || hit.type === 'sticky-note')) {
      this.startEditing(hit);
      return;
    }

    // 创建新文本元素
    const el = Elements.create('text', {
      x: w.x, y: w.y,
      width: 200, height: 30,
      text: '',
      fontSize: appState.fontSize || 20,
      fillColor: appState.strokeColor,
      strokeColor: 'transparent',
      strokeWidth: 0,
      textAlign: appState.textAlign || 'left',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
    });
    History.execute(new AddElementCommand(el));
    this.startEditing(el);
  },

  startEditing(el) {
    this.editingEl = el;
    const textarea = document.getElementById('text-editor');
    if (!textarea) return;

    // 根据对齐方式计算 textarea 的屏幕位置
    let baseX = el.x;
    if (el.textAlign === 'center') baseX = el.x + (el.width || 200) / 2;
    else if (el.textAlign === 'right') baseX = el.x + (el.width || 200);
    const pos = Camera.worldToScreen(baseX, el.y);

    const tw = Math.max(200, (el.width || 200) * Camera.zoom);
    const th = Math.max(30, (el.height || 30) * Camera.zoom);
    const fz = Math.max(12, (el.fontSize || 20) * Camera.zoom);

    // 居中文本需要将 textarea 向左偏移一半宽度
    let left = pos.x;
    if (el.textAlign === 'center') left = pos.x - tw / 2;
    else if (el.textAlign === 'right') left = pos.x - tw;

    // 文字颜色：便签始终用深色，文本元素用 fillColor
    const textColor = el.type === 'sticky-note'
      ? '#333333'
      : (el.fillColor || '#000000');

    textarea.style.display = 'block';
    textarea.style.left = Math.max(0, left) + 'px';
    textarea.style.top = Math.max(0, pos.y) + 'px';
    textarea.style.width = tw + 'px';
    textarea.style.minHeight = th + 'px';
    textarea.style.height = 'auto';
    textarea.style.fontSize = fz + 'px';
    textarea.style.fontFamily = el.fontFamily || '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif';
    textarea.style.color = textColor;
    textarea.style.lineHeight = '1.5';
    textarea.style.textAlign = el.textAlign || 'left';
    textarea.value = el.text || '';

    // 延迟 focus 确保 DOM 更新完成
    requestAnimationFrame(() => {
      textarea.focus();
      if (el.text) {
        textarea.setSelectionRange(0, el.text.length);
      }
    });

    this._onInput = () => {
      el.text = textarea.value;
      // 自适应高度
      textarea.style.height = 'auto';
      textarea.style.height = Math.max(th, textarea.scrollHeight) + 'px';
      el.height = textarea.scrollHeight / Camera.zoom;
      el.width = textarea.clientWidth / Camera.zoom;
      Renderer.markDirty();
    };

    this._onBlur = () => {
      // 延迟提交，避免与 mousedown 冲突
      setTimeout(() => this._commitEditing(), 150);
    };

    this._onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this._commitEditing();
      }
      // 阻止事件冒泡到全局快捷键
      e.stopPropagation();
    };

    textarea.addEventListener('input', this._onInput);
    textarea.addEventListener('blur', this._onBlur);
    textarea.addEventListener('keydown', this._onKeyDown);

    Renderer.selectedIds = [el.id];
    Renderer.markDirty();
  },

  _commitEditing() {
    const textarea = document.getElementById('text-editor');
    if (!textarea || textarea.style.display === 'none') return;

    if (this._onInput) textarea.removeEventListener('input', this._onInput);
    if (this._onBlur) textarea.removeEventListener('blur', this._onBlur);
    if (this._onKeyDown) textarea.removeEventListener('keydown', this._onKeyDown);
    this._onInput = this._onBlur = this._onKeyDown = null;

    if (this.editingEl) {
      const el = this.editingEl;
      // 如果文本为空（且是 text 类型），删除元素 — 通过历史系统
      if (el.type === 'text' && (!el.text || el.text.trim() === '')) {
        const idx = Elements.list.indexOf(el);
        if (idx !== -1) {
          Elements.list.splice(idx, 1);
          History.execute(new DeleteElementCommand(el, idx));
        }
        Renderer.selectedIds = Renderer.selectedIds.filter(id => id !== el.id);
      }
      // 更新元素尺寸以匹配 textarea
      el.width = Math.max(el.width || 200, textarea.clientWidth / Camera.zoom);
      el.height = Math.max(el.height || 30, textarea.scrollHeight / Camera.zoom);
    }

    textarea.style.display = 'none';
    textarea.value = '';
    this.editingEl = null;
    Renderer.markDirty();
  },

  onMouseMove(sx, sy, e) {},
  onMouseUp(sx, sy, e) {},
});


/* ================================================================
 *  便签工具 (sticky-note)
 * ================================================================ */
Tools.register('sticky-note', {
  name: 'sticky-note',
  cursor: 'cell',
  // sticky-note 实质上是样式的矩形，复用 shape tool 的交互
  // 创建后自动进入文本编辑
  _shapeTool: null,

  activate() {
    this._shapeTool = makeShapeTool('sticky-note', 'cell');
    this._shapeTool.activate();
  },

  deactivate() {
    if (this._shapeTool) this._shapeTool.deactivate();
  },

  onMouseDown(sx, sy, e) {
    this._shapeTool.startWX = Camera.screenToWorld(sx, sy).x;
    this._shapeTool.startWY = Camera.screenToWorld(sx, sy).y;
    this._shapeTool.drawing = true;
  },

  onMouseMove(sx, sy, e) {
    if (!this._shapeTool.drawing) return;
    const w = Camera.screenToWorld(sx, sy);
    let endX = w.x, endY = w.y;
    if (e.shiftKey) {
      const dx = Math.abs(endX - this._shapeTool.startWX);
      const dy = Math.abs(endY - this._shapeTool.startWY);
      const size = Math.max(dx, dy);
      endX = this._shapeTool.startWX + size * Math.sign(endX - this._shapeTool.startWX);
      endY = this._shapeTool.startWY + size * Math.sign(endY - this._shapeTool.startWY);
    }
    const x = Math.min(this._shapeTool.startWX, endX);
    const y = Math.min(this._shapeTool.startWY, endY);
    Renderer.preview = {
      type: 'sticky-note', x, y,
      width: Math.abs(endX - this._shapeTool.startWX),
      height: Math.abs(endY - this._shapeTool.startWY),
      fillColor: '#fff9c4',
      strokeColor: '#e6c200',
      strokeWidth: 1
    };
    Renderer.markDirty();
  },

  onMouseUp(sx, sy, e) {
    if (!this._shapeTool || !this._shapeTool.drawing) return;
    this._shapeTool.drawing = false;
    const w = Camera.screenToWorld(sx, sy);
    let endX = w.x, endY = w.y;
    if (e.shiftKey) {
      const dx = Math.abs(endX - this._shapeTool.startWX);
      const dy = Math.abs(endY - this._shapeTool.startWY);
      const size = Math.max(dx, dy);
      endX = this._shapeTool.startWX + size * Math.sign(endX - this._shapeTool.startWX);
      endY = this._shapeTool.startWY + size * Math.sign(endY - this._shapeTool.startWY);
    }
    const x = Math.min(this._shapeTool.startWX, endX);
    const y = Math.min(this._shapeTool.startWY, endY);
    const width = Math.abs(endX - this._shapeTool.startWX);
    const height = Math.abs(endY - this._shapeTool.startWY);
    if (width < 3 || height < 3) {
      // 单击放置默认尺寸便签
      const wx = Camera.screenToWorld(sx, sy);
      const el = Elements.create('sticky-note', {
        x: wx.x - 100, y: wx.y - 60,
        width: 200, height: 120,
        text: '',
        fontSize: 16,
        fillColor: '#fff9c4',
        strokeColor: '#e6c200',
        strokeWidth: 1
      });
      History.execute(new AddElementCommand(el));
      Renderer.preview = null;
      Renderer.markDirty();
      // 切换到文本工具编辑
      Tools.switchTo('text');
      Tools._tools['text'].startEditing(el);
      return;
    }

    Renderer.preview = null;
    const el = Elements.create('sticky-note', {
      x, y, width, height,
      fillColor: '#fff9c4',
      strokeColor: '#e6c200',
      strokeWidth: 1,
      fontSize: 16,
      text: ''
    });
    History.execute(new AddElementCommand(el));
    Renderer.markDirty();
    Tools.switchTo('text');
    Tools._tools['text'].startEditing(el);
  }
});


/* ================================================================
 *  橡皮擦工具 (eraser) — 支持单击和拖拽擦除
 * ================================================================ */
Tools.register('eraser', {
  name: 'eraser',
  cursor: 'pointer',
  _lastErased: null,

  activate() { Renderer.hoveredId = null; this._lastErased = null; },
  deactivate() { Renderer.hoveredId = null; Renderer.markDirty(); },

  _eraseHit(hit) {
    if (!hit || hit.id === this._lastErased) return;
    this._lastErased = hit.id;
    const idx = Elements.list.indexOf(hit);
    if (idx !== -1) {
      Elements.list.splice(idx, 1);
      History.execute(new DeleteElementCommand(hit, idx));
      const selIdx = Renderer.selectedIds.indexOf(hit.id);
      if (selIdx !== -1) Renderer.selectedIds.splice(selIdx, 1);
    }
    Renderer.hoveredId = null;
    Renderer.markDirty();
  },

  onMouseDown(sx, sy, e) {
    this._lastErased = null;
    const w = Camera.screenToWorld(sx, sy);
    this._eraseHit(Elements.hitTest(w.x, w.y));
  },

  onMouseMove(sx, sy, e) {
    const w = Camera.screenToWorld(sx, sy);
    const hit = Elements.hitTest(w.x, w.y);

    if (e.buttons === 1 && hit) {
      this._eraseHit(hit);
    }

    const newHovered = (e.buttons === 1) ? null : (hit ? hit.id : null);
    if (Renderer.hoveredId !== newHovered) {
      Renderer.hoveredId = newHovered;
      Renderer.markDirty();
    }
  },

  onMouseUp(sx, sy, e) {
    this._lastErased = null;
  }
});


/* ================================================================
 *  抓手工具 (hand)
 * ================================================================ */
Tools.register('hand', {
  name: 'hand',
  cursor: 'grab',
  panning: false,
  startCamX: 0, startCamY: 0,
  startMouseX: 0, startMouseY: 0,

  activate() { this.panning = false; },
  deactivate() { this.panning = false; },

  onMouseDown(sx, sy, e) {
    this.panning = true;
    this.startCamX = Camera.x;
    this.startCamY = Camera.y;
    this.startMouseX = sx;
    this.startMouseY = sy;
    document.getElementById('main-canvas').style.cursor = 'grabbing';
  },

  onMouseMove(sx, sy, e) {
    if (!this.panning) return;
    Camera.pan(sx - this.startMouseX, sy - this.startMouseY);
    this.startMouseX = sx;
    this.startMouseY = sy;
    Renderer.markDirty();
  },

  onMouseUp(sx, sy, e) {
    this.panning = false;
    document.getElementById('main-canvas').style.cursor = 'grab';
  }
});

/* ================================================================
 *  图片工具 (image)
 * ================================================================ */
Tools.register('image', {
  name: 'image',
  cursor: 'copy',

  activate() {
    // 激活时直接弹出文件选择器
    document.getElementById('input-image-file').click();
  },

  onMouseDown(sx, sy, e) {
    // 点击也弹出文件选择器
    document.getElementById('input-image-file').click();
  },

  onMouseMove(sx, sy, e) {},
  onMouseUp(sx, sy, e) {},
});
