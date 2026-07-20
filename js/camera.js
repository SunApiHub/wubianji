/* === 无边记 — 相机系统 === */

const Camera = {
  x: 0,        // 世界原点在屏幕上的 X 偏移（相机位置）
  y: 0,        // 世界原点在屏幕上的 Y 偏移
  zoom: 1,     // 缩放级别 (0.1 ~ 10)
  MIN_ZOOM: 0.1,
  MAX_ZOOM: 10,

  /**
   * 屏幕坐标 → 世界坐标
   */
  screenToWorld(sx, sy) {
    return {
      x: (sx - this.x) / this.zoom,
      y: (sy - this.y) / this.zoom
    };
  },

  /**
   * 世界坐标 → 屏幕坐标
   */
  worldToScreen(wx, wy) {
    return {
      x: wx * this.zoom + this.x,
      y: wy * this.zoom + this.y
    };
  },

  /**
   * 将屏幕距离转换为世界距离
   */
  screenToWorldDelta(dsx, dsy) {
    return {
      x: dsx / this.zoom,
      y: dsy / this.zoom
    };
  },

  /**
   * 以指定屏幕点为中心缩放
   * @param {number} sx - 缩放中心屏幕 X
   * @param {number} sy - 缩放中心屏幕 Y
   * @param {number} factor - 缩放因子 (>1 放大, <1 缩小)
   */
  zoomAt(sx, sy, factor) {
    const oldZoom = this.zoom;
    this.zoom = Math.max(this.MIN_ZOOM, Math.min(this.MAX_ZOOM, this.zoom * factor));

    // 保持缩放中心点在世界坐标中的位置不变
    this.x = sx - (sx - this.x) * (this.zoom / oldZoom);
    this.y = sy - (sy - this.y) * (this.zoom / oldZoom);
  },

  /**
   * 平移相机
   */
  pan(dx, dy) {
    this.x += dx;
    this.y += dy;
  },

  /**
   * 获取适配当前缩放级别的网格间距（世界单位）
   * 确保屏幕上的网格间距在 30~80px 之间
   */
  getGridSpacing() {
    const targetScreenSpacing = 50;
    const rawSpacing = targetScreenSpacing / this.zoom;

    // 从预设值中选择最接近的
    const presets = [10, 20, 25, 50, 100, 200, 500, 1000];
    let best = presets[0];
    for (const p of presets) {
      if (Math.abs(p - rawSpacing) < Math.abs(best - rawSpacing)) {
        best = p;
      }
    }
    return best;
  },

  /**
   * 获取网格透明度 (0~1)，缩放越远越透明
   */
  getGridOpacity() {
    // 在 zoom=1 时完全可见，越远越淡
    return Math.max(0, Math.min(1, 1 - Math.abs(Math.log2(this.zoom)) * 0.3));
  },

  /**
   * 重置相机到默认位置
   */
  reset() {
    this.x = 0;
    this.y = 0;
    this.zoom = 1;
  },

  /**
   * 使指定世界坐标区域在屏幕上可见
   */
  fitToScreen(worldBounds, padding = 50) {
    const canvas = document.getElementById('main-canvas');
    const cw = canvas.width;
    const ch = canvas.height;
    const availW = cw - padding * 2;
    const availH = ch - padding * 2;

    const worldW = worldBounds.maxX - worldBounds.minX;
    const worldH = worldBounds.maxY - worldBounds.minY;

    if (worldW <= 0 || worldH <= 0) { this.reset(); return; }

    this.zoom = Math.min(availW / worldW, availH / worldH, this.MAX_ZOOM);
    const centerWX = (worldBounds.minX + worldBounds.maxX) / 2;
    const centerWY = (worldBounds.minY + worldBounds.maxY) / 2;
    this.x = cw / 2 - centerWX * this.zoom;
    this.y = ch / 2 - centerWY * this.zoom;
  }
};
