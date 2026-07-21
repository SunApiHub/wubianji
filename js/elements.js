/* === 无边记 — 元素系统 === */

const Elements = {
  list: [],           // 所有元素的数组
  _idCounter: 0,      // ID 计数器

  /**
   * 生成唯一 ID
   */
  _genId() {
    return 'el_' + Date.now().toString(36) + '_' + (++this._idCounter).toString(36);
  },

  /**
   * 创建元素
   */
  create(type, props = {}) {
    const base = {
      id: this._genId(),
      type: type,
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      // 线条/箭头专用
      endX: undefined,
      endY: undefined,
      // 路径专用
      points: undefined,
      // 文本
      text: '',
      // 样式
      fillColor: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      opacity: 1,
      fontSize: 20,
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
      textAlign: 'left',
      // 通用
      rotation: 0,
      zIndex: this.list.length,
      locked: false,
      groupId: null,  // 编组 ID，null 表示未编组
    };

    const el = { ...base, ...props };
    el.id = base.id; // 保持 ID
    // 不在此处 push，由 AddElementCommand/AddElementsCommand 负责添加到列表
    return el;
  },

  /**
   * 删除元素
   */
  delete(id) {
    const idx = this.list.findIndex(e => e.id === id);
    if (idx !== -1) {
      const removed = this.list.splice(idx, 1)[0];
      return removed;
    }
    return null;
  },

  /**
   * 获取元素
   */
  get(id) {
    return this.list.find(e => e.id === id);
  },

  /**
   * 更新元素的属性
   */
  update(id, props) {
    const el = this.get(id);
    if (el) {
      Object.assign(el, props);
    }
    return el;
  },

  /**
   * 获取元素的包围盒（世界坐标）
   */
  getBounds(el) {
    if (el.type === 'line' || el.type === 'arrow') {
      const sx = Math.min(el.x, el.endX);
      const sy = Math.min(el.y, el.endY);
      const ex = Math.max(el.x, el.endX);
      const ey = Math.max(el.y, el.endY);
      // 最小尺寸防止零宽高
      const w = Math.max(ex - sx, 1);
      const h = Math.max(ey - sy, 1);
      return { x: sx, y: sy, width: w, height: h, minX: sx, minY: sy, maxX: ex, maxY: ey };
    }
    if (el.type === 'path' && el.points && el.points.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of el.points) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const w = Math.max(maxX - minX, 1);
      const h = Math.max(maxY - minY, 1);
      return { x: minX, y: minY, width: w, height: h, minX, minY, maxX, maxY };
    }
    return {
      x: el.x,
      y: el.y,
      width: el.width,
      height: el.height,
      minX: el.x,
      minY: el.y,
      maxX: el.x + el.width,
      maxY: el.y + el.height
    };
  },

  /**
   * 检测点 (wx, wy) 是否命中元素
   * 返回命中的最顶层元素（zIndex 最大），或 null
   */
  hitTest(wx, wy) {
    // 从顶层到下层遍历
    for (let i = this.list.length - 1; i >= 0; i--) {
      const el = this.list[i];
      if (el.locked) continue;

      if (this._hitElement(el, wx, wy)) {
        return el;
      }
    }
    return null;
  },

  /**
   * 检测点是否命中单个元素
   */
  _hitElement(el, wx, wy) {
    const b = this.getBounds(el);

    // 先做包围盒粗筛
    if (wx < b.minX - 5 || wx > b.maxX + 5 || wy < b.minY - 5 || wy > b.maxY + 5) {
      return false;
    }

    const pad = (el.type === 'line' || el.type === 'arrow') ? 8 : 0;
    const sw = Math.max(el.strokeWidth, pad);

    switch (el.type) {
      case 'rectangle':
      case 'sticky-note':
        return wx >= b.minX - sw && wx <= b.maxX + sw &&
               wy >= b.minY - sw && wy <= b.maxY + sw;

      case 'ellipse': {
        const cx = b.minX + b.width / 2;
        const cy = b.minY + b.height / 2;
        const rx = b.width / 2 + sw;
        const ry = b.height / 2 + sw;
        const dx = (wx - cx) / rx;
        const dy = (wy - cy) / ry;
        return dx * dx + dy * dy <= 1;
      }

      case 'line':
      case 'arrow':
        return this._pointToLineDistance(wx, wy, el.x, el.y, el.endX, el.endY) <= sw + 4;

      case 'path':
        if (!el.points || el.points.length < 2) return false;
        // 检查是否接近路径上任何线段
        for (let i = 1; i < el.points.length; i++) {
          const a = el.points[i - 1];
          const bb = el.points[i];
          if (this._pointToLineDistance(wx, wy, a.x, a.y, bb.x, bb.y) <= sw + 4) {
            return true;
          }
        }
        return false;

      case 'text':
        return wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY;

      case 'table':
        return wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY;

      default:
        return wx >= b.minX - sw && wx <= b.maxX + sw &&
               wy >= b.minY - sw && wy <= b.maxY + sw;
    }
  },

  /**
   * 点到线段的距离
   */
  _pointToLineDistance(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    const nearX = x1 + t * dx;
    const nearY = y1 + t * dy;
    return Math.hypot(px - nearX, py - nearY);
  },

  /**
   * 框选：返回完全或部分在矩形内的元素
   */
  hitTestRect(wx1, wy1, wx2, wy2) {
    const minX = Math.min(wx1, wx2);
    const minY = Math.min(wy1, wy2);
    const maxX = Math.max(wx1, wx2);
    const maxY = Math.max(wy1, wy2);

    const results = [];
    for (const el of this.list) {
      if (el.locked) continue;
      const b = this.getBounds(el);
      // 包围盒相交检测
      if (b.maxX >= minX && b.minX <= maxX && b.maxY >= minY && b.minY <= maxY) {
        results.push(el);
      }
    }
    // 按 zIndex 排序
    results.sort((a, b) => a.zIndex - b.zIndex);
    return results;
  },

  /**
   * 将所有元素按 zIndex 排序
   */
  sortByZIndex() {
    this.list.sort((a, b) => a.zIndex - b.zIndex);
  },

  /**
   * 将选中元素移到最顶层
   */
  bringToFront(el) {
    const maxZ = this.list.reduce((m, e) => Math.max(m, e.zIndex), 0);
    el.zIndex = maxZ + 1;
  },

  /**
   * 将所有元素的 zIndex 重新规范化（0, 1, 2, ...）
   */
  normalizeZIndex() {
    this.list.forEach((el, i) => { el.zIndex = i; });
  },

  /**
   * 将一组元素编组
   */
  group(ids) {
    if (ids.length < 2) return null;
    const groupId = 'grp_' + Date.now().toString(36);
    for (const id of ids) {
      const el = this.get(id);
      if (el) el.groupId = groupId;
    }
    return groupId;
  },

  /** 取消指定编组 */
  ungroup(groupId) {
    for (const el of this.list) {
      if (el.groupId === groupId) el.groupId = null;
    }
  },

  /** 取消选中元素所在的所有编组，返回取消的组数 */
  ungroupElements(ids) {
    const groups = new Set();
    for (const id of ids) {
      const el = this.get(id);
      if (el && el.groupId) groups.add(el.groupId);
    }
    for (const gid of groups) this.ungroup(gid);
    return groups.size;
  },

  /** 获取编组包围盒 */
  getGroupBounds(groupId) {
    const members = this.list.filter(e => e.groupId === groupId);
    if (members.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of members) {
      const b = this.getBounds(el);
      minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, minX, minY, maxX, maxY };
  },

  /**
   * 清空所有元素
   */
  clear() {
    this.list = [];
  },

  /**
   * 导出为 JSON 字符串
   */
  toJSON() {
    return JSON.stringify(this.list, null, 2);
  },

  /**
   * 从 JSON 字符串加载
   */
  fromJSON(json) {
    try {
      const data = JSON.parse(json);
      if (Array.isArray(data)) {
        this.list = data;
        this._idCounter = this.list.length;
        return true;
      }
    } catch (e) {
      console.error('加载失败:', e);
    }
    return false;
  }
};
