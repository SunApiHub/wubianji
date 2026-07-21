/* === 无边记 — 撤销/重做系统 === */

const History = {
  undoStack: [],
  redoStack: [],
  MAX_STACK: 100,

  /**
   * 执行一个命令并压入撤销栈
   */
  execute(cmd) {
    cmd.execute();
    this.undoStack.push(cmd);
    // 清空重做栈（新操作使重做无效）
    this.redoStack = [];
    // 限制栈大小
    if (this.undoStack.length > this.MAX_STACK) {
      this.undoStack.shift();
    }
    this._onChange();
  },

  /**
   * 撤销最近的操作
   */
  undo() {
    if (this.undoStack.length === 0) return false;
    const cmd = this.undoStack.pop();
    cmd.undo();
    this.redoStack.push(cmd);
    if (this.redoStack.length > this.MAX_STACK) {
      this.redoStack.shift();
    }
    this._onChange();
    return true;
  },

  /**
   * 重做最近撤销的操作
   */
  redo() {
    if (this.redoStack.length === 0) return false;
    const cmd = this.redoStack.pop();
    cmd.execute();
    this.undoStack.push(cmd);
    if (this.undoStack.length > this.MAX_STACK) {
      this.undoStack.shift();
    }
    this._onChange();
    return true;
  },

  canUndo() {
    return this.undoStack.length > 0;
  },

  canRedo() {
    return this.redoStack.length > 0;
  },

  /** 清空历史 */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this._onChange();
  },

  _onChange() {
    // 触发 UI 更新：由 app.js 在处理循环中检查
    if (typeof onHistoryChange === 'function') {
      onHistoryChange();
    }
  }
};

/**
 * 创建「添加元素」命令
 */
function AddElementCommand(el) {
  this.el = el;
}
AddElementCommand.prototype.execute = function() {
  Elements.list.push(this.el);
};
AddElementCommand.prototype.undo = function() {
  const idx = Elements.list.findIndex(e => e.id === this.el.id);
  if (idx !== -1) Elements.list.splice(idx, 1);
};

/**
 * 创建「批量添加元素」命令
 */
function AddElementsCommand(elements) {
  this.elements = elements;
}
AddElementsCommand.prototype.execute = function() {
  for (const el of this.elements) {
    Elements.list.push(el);
  }
};
AddElementsCommand.prototype.undo = function() {
  for (const el of this.elements) {
    const idx = Elements.list.findIndex(e => e.id === el.id);
    if (idx !== -1) Elements.list.splice(idx, 1);
  }
};

/**
 * 创建「删除元素」命令
 */
function DeleteElementCommand(el, index) {
  this.el = el;
  this.index = index;
}
DeleteElementCommand.prototype.execute = function() {
  const idx = Elements.list.findIndex(e => e.id === this.el.id);
  if (idx !== -1) Elements.list.splice(idx, 1);
};
DeleteElementCommand.prototype.undo = function() {
  Elements.list.splice(this.index, 0, this.el);
};

/**
 * 创建「批量删除元素」命令
 */
function DeleteElementsCommand(elements) {
  this.elements = elements.map(el => ({
    el: el,
    index: Elements.list.indexOf(el)
  }));
}
DeleteElementsCommand.prototype.execute = function() {
  for (const { el } of this.elements) {
    const idx = Elements.list.findIndex(e => e.id === el.id);
    if (idx !== -1) Elements.list.splice(idx, 1);
  }
};
DeleteElementsCommand.prototype.undo = function() {
  // 按原索引从大到小插入
  const sorted = [...this.elements].sort((a, b) => b.index - a.index);
  for (const { el, index } of sorted) {
    Elements.list.splice(index, 0, el);
  }
};

/**
 * 创建「批量命令」— 将多个命令合并为一个撤销步
 */
function BatchCommand(commands) {
  this.commands = commands;
}
BatchCommand.prototype.execute = function() {
  for (const cmd of this.commands) {
    cmd.execute();
  }
};
BatchCommand.prototype.undo = function() {
  // 逆序撤销
  for (let i = this.commands.length - 1; i >= 0; i--) {
    this.commands[i].undo();
  }
};

/**
 * 创建「编组」命令
 */
function GroupCommand(ids, groupId) {
  this.ids = [...ids];
  this.groupId = groupId;
}
GroupCommand.prototype.execute = function() {
  for (const id of this.ids) {
    const el = Elements.get(id);
    if (el) el.groupId = this.groupId;
  }
};
GroupCommand.prototype.undo = function() {
  for (const id of this.ids) {
    const el = Elements.get(id);
    if (el) el.groupId = null;
  }
};

/**
 * 创建「取消编组」命令
 */
function UngroupCommand(ids) {
  // 保存撤销所需的信息：哪些元素属于哪些组
  this.restoreMap = {};
  for (const id of ids) {
    const el = Elements.get(id);
    if (el && el.groupId) {
      if (!this.restoreMap[el.groupId]) this.restoreMap[el.groupId] = [];
      this.restoreMap[el.groupId].push(id);
    }
  }
}
UngroupCommand.prototype.execute = function() {
  Elements.ungroupElements(Object.keys(this.restoreMap).flatMap(gid => this.restoreMap[gid]));
};
UngroupCommand.prototype.undo = function() {
  for (const [gid, elIds] of Object.entries(this.restoreMap)) {
    for (const id of elIds) {
      const el = Elements.get(id);
      if (el) el.groupId = gid;
    }
  }
};

/**
 * 创建「移动元素」命令
 */
function MoveElementCommand(el, oldX, oldY, newX, newY, oldEndX, oldEndY, newEndX, newEndY) {
  this.el = el;
  this.oldX = oldX;
  this.oldY = oldY;
  this.newX = newX;
  this.newY = newY;
  this.oldEndX = oldEndX;
  this.oldEndY = oldEndY;
  this.newEndX = newEndX;
  this.newEndY = newEndY;
}
MoveElementCommand.prototype.execute = function() {
  this.el.x = this.newX;
  this.el.y = this.newY;
  if (this.newEndX !== undefined) {
    this.el.endX = this.newEndX;
    this.el.endY = this.newEndY;
  }
};
MoveElementCommand.prototype.undo = function() {
  this.el.x = this.oldX;
  this.el.y = this.oldY;
  if (this.oldEndX !== undefined) {
    this.el.endX = this.oldEndX;
    this.el.endY = this.oldEndY;
  }
};

/**
 * 创建「缩放/调整元素」命令
 */
function ResizeElementCommand(el, oldProps, newProps) {
  this.el = el;
  this.oldProps = { ...oldProps };
  this.newProps = { ...newProps };
}
ResizeElementCommand.prototype.execute = function() {
  Object.assign(this.el, this.newProps);
};
ResizeElementCommand.prototype.undo = function() {
  Object.assign(this.el, this.oldProps);
};

/** 创建「表格状态」命令 */
function TableStateCommand(el, oldState, newState) {
  this.el = el;
  this.oldState = JSON.parse(JSON.stringify(oldState));
  this.newState = JSON.parse(JSON.stringify(newState));
}
TableStateCommand.prototype._apply = function(state) {
  Object.assign(this.el, JSON.parse(JSON.stringify(state)));
};
TableStateCommand.prototype.execute = function() {
  this._apply(this.newState);
};
TableStateCommand.prototype.undo = function() {
  this._apply(this.oldState);
};

/** 创建「文字编辑」命令 */
function TextEditCommand(el, oldProps, newProps) {
  this.el = el;
  this.oldProps = { ...oldProps };
  this.newProps = { ...newProps };
}
TextEditCommand.prototype.execute = function() {
  Object.assign(this.el, this.newProps);
};
TextEditCommand.prototype.undo = function() {
  Object.assign(this.el, this.oldProps);
};

/**
 * 创建「更新元素样式」命令
 */
function UpdateStyleCommand(el, oldStyle, newStyle) {
  this.el = el;
  this.oldStyle = { ...oldStyle };
  this.newStyle = { ...newStyle };
}
UpdateStyleCommand.prototype.execute = function() {
  Object.assign(this.el, this.newStyle);
};
UpdateStyleCommand.prototype.undo = function() {
  Object.assign(this.el, this.oldStyle);
};
