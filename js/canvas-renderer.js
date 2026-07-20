/* === 无边记 — Canvas 渲染器 === */

const Renderer = {
  canvas: null,
  ctx: null,
  dirty: true,             // 脏标记：true 时需要重绘
  animationId: null,        // requestAnimationFrame ID

  // 选中相关
  selectedIds: [],          // 选中的元素 ID 列表
  hoveredId: null,          // 悬停的元素 ID（橡皮擦高亮用）
  selectionBox: null,       // 框选矩形 { x1, y1, x2, y2 } 世界坐标

  // 预览相关
  preview: null,            // 当前工具预览 { type, x, y, width, height, ... }

  /** 颜色: 选中框 */
  SELECT_COLOR: '#007aff',
  /** 颜色: 悬停高亮 */
  HOVER_COLOR: '#ff9500',

  /** 初始化 */
  init() {
    this.canvas = document.getElementById('main-canvas');
    this.ctx = this.canvas.getContext('2d');
    this._resize();
    window.addEventListener('resize', () => this._resize());
  },

  _resize() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.markDirty();
  },

  /** 标记需要重绘 */
  markDirty() {
    this.dirty = true;
  },

  /** 主渲染循环 */
  render() {
    if (!this.dirty) return;
    this.dirty = false;

    const ctx = this.ctx;
    const cw = this.canvas.width / (window.devicePixelRatio || 1);
    const ch = this.canvas.height / (window.devicePixelRatio || 1);

    // 清空画布
    ctx.clearRect(0, 0, cw, ch);

    // 背景色
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#f0f0f0';
    ctx.fillRect(0, 0, cw, ch);

    // 保存状态，应用相机变换
    ctx.save();
    ctx.translate(Camera.x, Camera.y);
    ctx.scale(Camera.zoom, Camera.zoom);

    // 1. 绘制网格
    this._drawGrid(ctx, cw, ch);

    // 2. 绘制所有元素（按 zIndex 排序）
    for (const el of Elements.list) {
      this._drawElement(ctx, el);
    }

    // 3. 绘制预览（正在创建的元素）
    if (this.preview) {
      this._drawPreview(ctx, this.preview);
    }

    // 4. 绘制选中框和手柄
    const drawnGroups = new Set();
    for (const id of this.selectedIds) {
      const el = Elements.get(id);
      if (!el) continue;
      this._drawSelection(ctx, el);
      // 如果元素属于编组，收集编组 ID
      if (el.groupId && !drawnGroups.has(el.groupId)) {
        drawnGroups.add(el.groupId);
      }
    }

    // 4.5 绘制编组边界框
    for (const groupId of drawnGroups) {
      this._drawGroupBounds(ctx, groupId);
    }

    // 5. 绘制框选矩形
    if (this.selectionBox) {
      this._drawSelectionBox(ctx);
    }

    // 6. 绘制悬停高亮（橡皮擦模式）
    if (this.hoveredId) {
      const el = Elements.get(this.hoveredId);
      if (el && !this.selectedIds.includes(this.hoveredId)) {
        this._drawHoverHighlight(ctx, el);
      }
    }

    ctx.restore();
  },

  /** 启动渲染循环 */
  startLoop() {
    const loop = () => {
      this.render();
      this.animationId = requestAnimationFrame(loop);
    };
    loop();
  },

  /* ========================================================
   *  网格
   * ======================================================== */

  _drawGrid(ctx, cw, ch) {
    const spacing = Camera.getGridSpacing();
    const opacity = Camera.getGridOpacity();
    if (opacity <= 0.01) return;

    const dotRadius = 1;
    const screenDotRadius = dotRadius * Camera.zoom; // 世界坐标中点的半径（但我们需要在屏幕空间）

    // 计算可见的世界坐标范围
    const topLeft = Camera.screenToWorld(0, 0);
    const botRight = Camera.screenToWorld(cw, ch);

    const startX = Math.floor(topLeft.x / spacing) * spacing;
    const startY = Math.floor(topLeft.y / spacing) * spacing;

    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#86868b';
    ctx.globalAlpha = opacity * 0.5;

    // 只在更近的缩放级别绘制网格点
    if (spacing >= 20 / Camera.zoom) {
      for (let wx = startX; wx <= botRight.x; wx += spacing) {
        for (let wy = startY; wy <= botRight.y; wy += spacing) {
          ctx.beginPath();
          ctx.arc(wx, wy, 1, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    ctx.globalAlpha = 1;
  },

  /* ========================================================
   *  元素绘制
   * ======================================================== */

  _drawElement(ctx, el) {
    ctx.save();
    ctx.globalAlpha = el.opacity || 1;

    // 应用旋转（绕元素中心）
    if (el.rotation) {
      const b = Elements.getBounds(el);
      const cx = b.x + b.width / 2;
      const cy = b.y + b.height / 2;
      ctx.translate(cx, cy);
      ctx.rotate((el.rotation * Math.PI) / 180);
      ctx.translate(-cx, -cy);
    }

    switch (el.type) {
      case 'rectangle': this._drawRectangle(ctx, el); break;
      case 'ellipse': this._drawEllipse(ctx, el); break;
      case 'line': this._drawLine(ctx, el); break;
      case 'arrow': this._drawArrow(ctx, el); break;
      case 'text': this._drawText(ctx, el); break;
      case 'sticky-note': this._drawStickyNote(ctx, el); break;
      case 'path': this._drawPath(ctx, el); break;
    }

    ctx.restore();
  },

  _drawRectangle(ctx, el) {
    const { x, y, width, height, fillColor, strokeColor, strokeWidth } = el;
    const r = 6; // 圆角半径

    // 填充
    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.beginPath();
      this._roundRect(ctx, x, y, width, height, r);
      ctx.fill();
    }

    // 描边
    if (strokeColor && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.beginPath();
      this._roundRect(ctx, x, y, width, height, r);
      ctx.stroke();
    }
  },

  _drawEllipse(ctx, el) {
    const { x, y, width, height, fillColor, strokeColor, strokeWidth } = el;
    const cx = x + width / 2;
    const cy = y + height / 2;
    const rx = Math.abs(width / 2);
    const ry = Math.abs(height / 2);

    ctx.beginPath();
    ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);

    if (fillColor && fillColor !== 'transparent') {
      ctx.fillStyle = fillColor;
      ctx.fill();
    }

    if (strokeColor && strokeWidth > 0) {
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.stroke();
    }
  },

  _drawLine(ctx, el) {
    const { x, y, endX, endY, strokeColor, strokeWidth } = el;
    if (endX === undefined || endY === undefined) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  },

  _drawArrow(ctx, el) {
    const { x, y, endX, endY, strokeColor, strokeWidth } = el;
    if (endX === undefined || endY === undefined) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // 箭头三角形
    const angle = Math.atan2(endY - y, endX - x);
    const arrowSize = Math.max(12, strokeWidth * 4);
    ctx.fillStyle = strokeColor;
    ctx.beginPath();
    ctx.moveTo(endX, endY);
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle - Math.PI / 6),
      endY - arrowSize * Math.sin(angle - Math.PI / 6)
    );
    ctx.lineTo(
      endX - arrowSize * Math.cos(angle + Math.PI / 6),
      endY - arrowSize * Math.sin(angle + Math.PI / 6)
    );
    ctx.closePath();
    ctx.fill();
  },

  _drawText(ctx, el) {
    const { x, y, text, fontSize, fontFamily, fillColor, textAlign } = el;
    if (!fillColor || fillColor === 'transparent') return;

    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.textAlign = textAlign || 'left';
    ctx.textBaseline = 'top';
    ctx.fillStyle = fillColor;

    const lines = (text || '').split('\n');
    const lineHeight = fontSize * 1.4;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], x, y + i * lineHeight);
    }
  },

  _drawStickyNote(ctx, el) {
    const { x, y, width, height, fillColor, text, fontSize, fontFamily } = el;

    // 阴影
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetX = 3;
    ctx.shadowOffsetY = 3;

    // 稍微倾斜的外观
    const skew = 1.5;
    ctx.transform(1, 0, Math.tan(skew * Math.PI / 180), 1, 0, 0);

    // 背景
    ctx.fillStyle = fillColor || '#fff9c4';
    ctx.beginPath();
    this._roundRect(ctx, x, y, width, height, 4);
    ctx.fill();
    ctx.restore();

    // 右上角折角效果（小三角形）
    const foldSize = 14;
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + width - foldSize, y);
    ctx.lineTo(x + width, y);
    ctx.lineTo(x + width, y + foldSize);
    ctx.closePath();
    ctx.fill();

    // 文本
    if (text) {
      ctx.fillStyle = '#333';
      ctx.font = `${fontSize || 16}px ${fontFamily || '-apple-system, BlinkMacSystemFont, sans-serif'}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const lines = text.split('\n');
      const lineHeight = (fontSize || 16) * 1.4;
      lines.forEach((line, i) => {
        ctx.fillText(line, x + 10, y + 10 + i * lineHeight);
      });
    }
  },

  _drawPath(ctx, el) {
    const { points, strokeColor, strokeWidth } = el;
    if (!points || points.length < 2) return;

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = strokeWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);

    if (points.length === 2) {
      ctx.lineTo(points[1].x, points[1].y);
    } else {
      // 使用二次贝塞尔曲线平滑
      for (let i = 1; i < points.length - 1; i++) {
        const midX = (points[i].x + points[i + 1].x) / 2;
        const midY = (points[i].y + points[i + 1].y) / 2;
        ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
      }
      // 连接到最后一个点
      const last = points[points.length - 1];
      ctx.lineTo(last.x, last.y);
    }

    ctx.stroke();
  },

  /* ========================================================
   *  选中与手柄
   * ======================================================== */

  _drawSelection(ctx, el) {
    const b = Elements.getBounds(el);
    const pad = Math.max(6 / Camera.zoom, 4);

    // 虚线边框
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = this.SELECT_COLOR;
    ctx.lineWidth = 2 / Camera.zoom;
    ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    ctx.restore();

    // 手柄
    const handles = this._getSelectionHandles(b, pad);
    for (const h of handles) {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = this.SELECT_COLOR;
      ctx.lineWidth = 2 / Camera.zoom;
      const size = 8 / Camera.zoom;
      ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size);
      ctx.strokeRect(h.x - size / 2, h.y - size / 2, size, size);
    }

    // 旋转手柄（顶部中间 + 连接线）
    const topCenter = { x: b.x + b.width / 2, y: b.y - pad };
    const rotationHandle = { x: topCenter.x, y: topCenter.y - 24 / Camera.zoom };
    ctx.strokeStyle = this.SELECT_COLOR;
    ctx.lineWidth = 1.5 / Camera.zoom;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(topCenter.x, topCenter.y);
    ctx.lineTo(rotationHandle.x, rotationHandle.y);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = this.SELECT_COLOR;
    ctx.lineWidth = 2 / Camera.zoom;
    const rSize = 7 / Camera.zoom;
    ctx.beginPath();
    ctx.arc(rotationHandle.x, rotationHandle.y, rSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  },

  _getSelectionHandles(bounds, pad) {
    const { x, y, width, height } = bounds;
    const bx = x - pad;
    const by = y - pad;
    const bw = width + pad * 2;
    const bh = height + pad * 2;

    return [
      { x: bx, y: by },                     // 左上
      { x: bx + bw / 2, y: by },            // 上中
      { x: bx + bw, y: by },                // 右上
      { x: bx + bw, y: by + bh / 2 },       // 右中
      { x: bx + bw, y: by + bh },           // 右下
      { x: bx + bw / 2, y: by + bh },       // 下中
      { x: bx, y: by + bh },                // 左下
      { x: bx, y: by + bh / 2 },            // 左中
    ];
  },

  /**
   * 检测屏幕坐标 (sx, sy) 命中了哪个手柄
   * 返回 'nw'|'n'|'ne'|'e'|'se'|'s'|'sw'|'w'|'rotate'|null
   */
  hitTestHandle(el, sx, sy) {
    const wx = Camera.screenToWorld(sx, sy);
    const b = Elements.getBounds(el);
    const pad = Math.max(6 / Camera.zoom, 4);
    const handles = this._getSelectionHandles(b, pad);
    const hitRadius = 10 / Camera.zoom;

    const labels = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
    for (let i = 0; i < handles.length; i++) {
      const h = handles[i];
      if (Math.abs(wx.x - h.x) < hitRadius && Math.abs(wx.y - h.y) < hitRadius) {
        return labels[i];
      }
    }

    // 旋转手柄
    const topCenter = { x: b.x + b.width / 2, y: b.y - pad };
    const rh = { x: topCenter.x, y: topCenter.y - 24 / Camera.zoom };
    if (Math.abs(wx.x - rh.x) < hitRadius && Math.abs(wx.y - rh.y) < hitRadius) {
      return 'rotate';
    }

    return null;
  },

  _drawHoverHighlight(ctx, el) {
    const b = Elements.getBounds(el);
    const pad = 4 / Camera.zoom;
    ctx.strokeStyle = this.HOVER_COLOR;
    ctx.lineWidth = 3 / Camera.zoom;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    ctx.setLineDash([]);
  },

  _drawSelectionBox(ctx) {
    const { x1, y1, x2, y2 } = this.selectionBox;
    ctx.fillStyle = 'rgba(0, 122, 255, 0.08)';
    ctx.strokeStyle = this.SELECT_COLOR;
    ctx.lineWidth = 1.5 / Camera.zoom;
    ctx.setLineDash([5, 3]);

    const x = Math.min(x1, x2);
    const y = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);
  },

  /** 绘制编组边界 */
  _drawGroupBounds(ctx, groupId) {
    const b = Elements.getGroupBounds(groupId);
    if (!b) return;
    const pad = Math.max(8 / Camera.zoom, 5);
    ctx.strokeStyle = '#af52de'; // 紫色边框表示编组
    ctx.lineWidth = 2.5 / Camera.zoom;
    ctx.setLineDash([8, 4]);
    ctx.strokeRect(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
    ctx.setLineDash([]);

    // 编组标签
    const labelY = b.y - pad - 6 / Camera.zoom;
    ctx.font = `${Math.max(10, 11 / Camera.zoom)}px -apple-system, sans-serif`;
    ctx.fillStyle = '#af52de';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('编组', b.x + b.width / 2, labelY);
  },

  /* ========================================================
   *  预览绘制
   * ======================================================== */

  _drawPreview(ctx, preview) {
    ctx.save();
    ctx.globalAlpha = 0.6;
    ctx.setLineDash([6, 4]);

    switch (preview.type) {
      case 'rectangle':
      case 'sticky-note':
        this._drawRectangle(ctx, { ...preview, fillColor: preview.fillColor || 'transparent' });
        break;
      case 'ellipse':
        this._drawEllipse(ctx, { ...preview, fillColor: 'transparent' });
        break;
      case 'line':
      case 'arrow':
        this._drawLine(ctx, preview);
        break;
      case 'path':
        this._drawPath(ctx, preview);
        break;
    }

    ctx.setLineDash([]);
    ctx.restore();
  },

  /* ========================================================
   *  辅助方法
   * ======================================================== */

  _roundRect(ctx, x, y, w, h, r) {
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x + r, y + h);
    ctx.arcTo(x, y + h, x, y + h - r, r);
    ctx.lineTo(x, y + r);
    ctx.arcTo(x, y, x + r, y, r);
    ctx.closePath();
  },

  /**
   * 导出当前视口为 PNG
   */
  exportPNG() {
    // 暂时渲染到视口
    const dataURL = this.canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = '无边记_' + new Date().toISOString().slice(0, 10) + '.png';
    link.href = dataURL;
    link.click();
  }
};
