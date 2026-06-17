const STORAGE_KEY = "jindubiao.tables.v1";
const DEFAULT_COLUMNS = 8;
const DEFAULT_ROWS = 22;
const DEFAULT_WIDTHS = [112, 140];
const STANDARD_WIDTH = 168;
const MIN_COLUMN_WIDTH = 76;
const LINK_HOVER_DELAY = 2000;
const URL_PATTERN = /((https?:\/\/|www\.)[^\s<>"']+)/i;

const state = {
  tables: [],
  activeId: "",
  editMode: false,
  linkHoverTimer: 0,
  linkHoverCell: null,
};

const els = {
  tableSelect: document.querySelector("#tableSelect"),
  tableNameInput: document.querySelector("#tableNameInput"),
  newTableBtn: document.querySelector("#newTableBtn"),
  importBtn: document.querySelector("#importBtn"),
  importFileInput: document.querySelector("#importFileInput"),
  editModeBtn: document.querySelector("#editModeBtn"),
  addColumnBtn: document.querySelector("#addColumnBtn"),
  addRowBtn: document.querySelector("#addRowBtn"),
  deleteTableBtn: document.querySelector("#deleteTableBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  progressTable: document.querySelector("#progressTable"),
};

function uid() {
  return `table-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeColumns(count = DEFAULT_COLUMNS) {
  return Array.from({ length: count }, (_, index) => {
    if (index === 0) return "第几周";
    if (index === 1) return "月 / 日 / 时";
    return `进度 ${index - 1}`;
  });
}

function makeRows(count = DEFAULT_ROWS, columns = DEFAULT_COLUMNS) {
  return Array.from({ length: count }, () => ({
    firstFilledAt: "",
    cells: Array.from({ length: columns }, () => ({ text: "", checked: false })),
  }));
}

function createTable(name = "未命名表格") {
  const columns = makeColumns();
  return {
    id: uid(),
    name,
    columns,
    columnWidths: makeColumnWidths(columns.length),
    rows: makeRows(DEFAULT_ROWS, columns.length),
  };
}

function makeColumnWidths(count) {
  return Array.from({ length: count }, (_, index) => DEFAULT_WIDTHS[index] || STANDARD_WIDTH);
}

function loadState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const table = createTable("工作进度表 1");
    state.tables = [table];
    state.activeId = table.id;
    saveState();
    return;
  }

  try {
    const parsed = JSON.parse(raw);
    state.tables = Array.isArray(parsed.tables) && parsed.tables.length ? parsed.tables : [createTable("工作进度表 1")];
    state.activeId = parsed.activeId || state.tables[0].id;
    state.tables.forEach(normalizeTable);
  } catch {
    const table = createTable("工作进度表 1");
    state.tables = [table];
    state.activeId = table.id;
  }
}

function normalizeTable(table) {
  table.columns = Array.isArray(table.columns) && table.columns.length ? table.columns : makeColumns();
  table.columnWidths = Array.isArray(table.columnWidths) ? table.columnWidths : [];
  table.columns.forEach((_, index) => {
    if (!Number.isFinite(table.columnWidths[index])) {
      table.columnWidths[index] = DEFAULT_WIDTHS[index] || STANDARD_WIDTH;
    }
  });
  table.columnWidths.length = table.columns.length;
  table.rows = Array.isArray(table.rows) ? table.rows : [];
  table.rows.forEach((row) => {
    row.firstFilledAt ||= "";
    row.cells = Array.isArray(row.cells) ? row.cells : [];
    table.columns.forEach((_, index) => {
      row.cells[index] ||= { text: "", checked: false };
    });
    row.cells.length = table.columns.length;
  });
}

function saveState() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      tables: state.tables,
      activeId: state.activeId,
    })
  );
}

function activeTable() {
  return state.tables.find((table) => table.id === state.activeId) || state.tables[0];
}

function renderAll() {
  renderTableSelect();
  renderEditControls();
  renderTable();
}

function renderEditControls() {
  els.editModeBtn.classList.toggle("active", state.editMode);
  els.editModeBtn.textContent = state.editMode ? "完成" : "编辑";
  els.deleteTableBtn.hidden = !state.editMode;
}

function renderTableSelect() {
  const table = activeTable();
  els.tableSelect.innerHTML = "";
  state.tables.forEach((item) => {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    els.tableSelect.append(option);
  });
  els.tableSelect.value = table.id;
  els.tableNameInput.value = table.name;
}

function renderTable() {
  const table = activeTable();
  els.progressTable.innerHTML = "";
  els.progressTable.classList.toggle("edit-mode", state.editMode);
  setTableWidth(table);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  table.columns.forEach((name, columnIndex) => {
    const th = document.createElement("th");
    setColumnGeometry(th, columnIndex);
    const editor = document.createElement("div");
    editor.className = "head-editor";
    editor.contentEditable = "true";
    editor.spellcheck = false;
    editor.textContent = name;
    editor.dataset.column = String(columnIndex);
    editor.addEventListener("input", handleHeaderInput);
    if (state.editMode && columnIndex > 1) {
      const deleteColumnBtn = document.createElement("button");
      deleteColumnBtn.className = "delete-column-btn";
      deleteColumnBtn.type = "button";
      deleteColumnBtn.dataset.column = String(columnIndex);
      deleteColumnBtn.title = "删除这一列";
      deleteColumnBtn.textContent = "×";
      deleteColumnBtn.addEventListener("click", deleteColumn);
      th.append(deleteColumnBtn);
    }
    const resizer = document.createElement("span");
    resizer.className = "col-resizer";
    resizer.dataset.column = String(columnIndex);
    resizer.addEventListener("mousedown", startColumnResize);
    th.append(editor, resizer);
    headRow.append(th);
  });
  thead.append(headRow);

  const tbody = document.createElement("tbody");
  table.rows.forEach((row, rowIndex) => {
    const tr = document.createElement("tr");
    table.columns.forEach((_, columnIndex) => {
      const cell = row.cells[columnIndex] || { text: "", checked: false };
      row.cells[columnIndex] = cell;

      const td = document.createElement("td");
      setColumnGeometry(td, columnIndex);
      if (cell.checked) td.classList.add("checked");
      if (state.editMode && columnIndex === 0) {
        const deleteRowBtn = document.createElement("button");
        deleteRowBtn.className = "delete-row-btn";
        deleteRowBtn.type = "button";
        deleteRowBtn.dataset.row = String(rowIndex);
        deleteRowBtn.title = "删除这一行";
        deleteRowBtn.textContent = "×";
        deleteRowBtn.addEventListener("click", deleteRow);
        td.append(deleteRowBtn);
      }

      const editor = document.createElement("div");
      editor.className = "cell-editor";
      editor.contentEditable = "true";
      editor.spellcheck = false;
      editor.textContent = cell.text;
      editor.dataset.row = String(rowIndex);
      editor.dataset.column = String(columnIndex);
      editor.addEventListener("input", handleCellInput);
      editor.addEventListener("keydown", handleCellKeydown);

      const linkButton = document.createElement("button");
      linkButton.className = "cell-link-btn";
      linkButton.type = "button";
      linkButton.textContent = "打开链接";
      linkButton.hidden = true;
      linkButton.addEventListener("click", openCellLink);

      const checkZone = document.createElement("button");
      checkZone.className = "check-zone";
      checkZone.type = "button";
      checkZone.tabIndex = -1;
      checkZone.dataset.row = String(rowIndex);
      checkZone.dataset.column = String(columnIndex);
      checkZone.title = "切换完成标记";
      checkZone.addEventListener("click", handleCheckToggle);

      td.addEventListener("mouseenter", scheduleLinkHover);
      td.addEventListener("mouseleave", cancelLinkHover);
      td.addEventListener("touchstart", scheduleLinkHover, { passive: true });
      td.addEventListener("touchmove", cancelLinkHover, { passive: true });
      td.addEventListener("touchend", finishTouchLinkHover);
      td.append(editor, linkButton, checkZone);
      tr.append(td);
    });
    tbody.append(tr);
  });

  els.progressTable.append(thead, tbody);
}

function setTableWidth(table) {
  const totalWidth = table.columnWidths.reduce((sum, width) => sum + width, 0);
  els.progressTable.style.setProperty("--table-width", `${totalWidth}px`);
}

function setColumnGeometry(element, columnIndex) {
  const table = activeTable();
  const width = table.columnWidths[columnIndex] || DEFAULT_WIDTHS[columnIndex] || STANDARD_WIDTH;
  element.style.width = `${width}px`;
  element.style.minWidth = `${width}px`;

  if (columnIndex === 1) {
    const firstWidth = table.columnWidths[0] || DEFAULT_WIDTHS[0];
    element.style.left = `${firstWidth}px`;
  }
}

function handleHeaderInput(event) {
  const table = activeTable();
  const columnIndex = Number(event.currentTarget.dataset.column);
  table.columns[columnIndex] = event.currentTarget.textContent.trim() || `列 ${columnIndex + 1}`;
  saveState();
  renderTableSelect();
}

function handleCellInput(event) {
  const table = activeTable();
  const rowIndex = Number(event.currentTarget.dataset.row);
  const columnIndex = Number(event.currentTarget.dataset.column);
  const row = table.rows[rowIndex];
  row.cells[columnIndex].text = event.currentTarget.textContent;

  if (columnIndex > 1 && event.currentTarget.textContent.trim() && !row.firstFilledAt) {
    row.firstFilledAt = new Date().toISOString();
    if (!row.cells[0].text.trim()) row.cells[0].text = weekLabel(row.firstFilledAt);
    if (!row.cells[1].text.trim()) row.cells[1].text = dateHourLabel(row.firstFilledAt);
    saveState();
    renderTable();
    focusCell(rowIndex, columnIndex);
    return;
  }

  saveState();
}

function handleCellKeydown(event) {
  if (event.key !== "Enter") return;
  event.preventDefault();
  const rowIndex = Number(event.currentTarget.dataset.row);
  const columnIndex = Number(event.currentTarget.dataset.column);
  focusCell(Math.min(rowIndex + 1, activeTable().rows.length - 1), columnIndex);
}

function scheduleLinkHover(event) {
  const cell = event.currentTarget;
  const editor = cell.querySelector(".cell-editor");
  const url = extractUrl(editor.textContent);
  if (!url) {
    hideCellLinkButton();
    return;
  }

  state.linkHoverCell = cell;
  clearTimeout(state.linkHoverTimer);
  state.linkHoverTimer = window.setTimeout(() => {
    if (state.linkHoverCell === cell && document.body.contains(cell)) {
      showCellLinkButton(cell, url);
    }
  }, LINK_HOVER_DELAY);
}

function cancelLinkHover() {
  hideCellLinkButton();
}

function finishTouchLinkHover() {
  if (!state.linkHoverCell) return;
  const button = state.linkHoverCell.querySelector(".cell-link-btn");
  if (button && !button.hidden) return;
  hideCellLinkButton();
}

function hideCellLinkButton() {
  clearTimeout(state.linkHoverTimer);
  if (state.linkHoverCell) {
    const button = state.linkHoverCell.querySelector(".cell-link-btn");
    if (button) button.hidden = true;
  }
  state.linkHoverCell = null;
}

function showCellLinkButton(cell, rawUrl) {
  const button = cell.querySelector(".cell-link-btn");
  if (!button) return;
  button.dataset.url = normalizeUrl(rawUrl);
  button.textContent = `打开 ${shortUrl(rawUrl)}`;
  button.hidden = false;
}

function openCellLink(event) {
  event.preventDefault();
  event.stopPropagation();
  const url = event.currentTarget.dataset.url;
  if (url) window.open(url, "_blank", "noopener");
}

function extractUrl(text) {
  const match = String(text || "").match(URL_PATTERN);
  return match ? match[1] : "";
}

function normalizeUrl(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function shortUrl(url) {
  return url.length > 34 ? `${url.slice(0, 31)}...` : url;
}

function handleCheckToggle(event) {
  event.preventDefault();
  event.stopPropagation();
  const table = activeTable();
  const rowIndex = Number(event.currentTarget.dataset.row);
  const columnIndex = Number(event.currentTarget.dataset.column);
  const cell = table.rows[rowIndex].cells[columnIndex];
  cell.checked = !cell.checked;
  saveState();
  event.currentTarget.closest("td").classList.toggle("checked", cell.checked);
}

function focusCell(rowIndex, columnIndex) {
  requestAnimationFrame(() => {
    const selector = `.cell-editor[data-row="${rowIndex}"][data-column="${columnIndex}"]`;
    const editor = els.progressTable.querySelector(selector);
    if (!editor) return;
    editor.focus();
    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  });
}

function weekLabel(isoString) {
  const date = new Date(isoString);
  const start = new Date(date.getFullYear(), 0, 1);
  const dayOffset = Math.floor((date - start) / 86400000);
  return `第${Math.floor((dayOffset + start.getDay()) / 7) + 1}周`;
}

function dateHourLabel(isoString) {
  const date = new Date(isoString);
  return `${date.getMonth() + 1}月${date.getDate()}日${date.getHours()}时`;
}

function addColumn() {
  const table = activeTable();
  table.columns.push(`进度 ${table.columns.length - 1}`);
  table.columnWidths.push(STANDARD_WIDTH);
  table.rows.forEach((row) => row.cells.push({ text: "", checked: false }));
  saveState();
  renderTable();
}

function startColumnResize(event) {
  event.preventDefault();
  event.stopPropagation();

  const table = activeTable();
  const columnIndex = Number(event.currentTarget.dataset.column);
  const startX = event.clientX;
  const startWidth = table.columnWidths[columnIndex] || STANDARD_WIDTH;

  document.body.classList.add("resizing");

  const move = (moveEvent) => {
    const nextWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + moveEvent.clientX - startX);
    table.columnWidths[columnIndex] = nextWidth;
    setTableWidth(table);
    applyColumnWidth(columnIndex, nextWidth);
    if (columnIndex === 0) applySecondColumnOffset(nextWidth);
  };

  const stop = () => {
    document.body.classList.remove("resizing");
    window.removeEventListener("mousemove", move);
    window.removeEventListener("mouseup", stop);
    saveState();
  };

  window.addEventListener("mousemove", move);
  window.addEventListener("mouseup", stop);
}

function applyColumnWidth(columnIndex, width) {
  const cells = els.progressTable.querySelectorAll(`tr > *:nth-child(${columnIndex + 1})`);
  cells.forEach((cell) => {
    cell.style.width = `${width}px`;
    cell.style.minWidth = `${width}px`;
  });
}

function applySecondColumnOffset(firstWidth) {
  const cells = els.progressTable.querySelectorAll("tr > *:nth-child(2)");
  cells.forEach((cell) => {
    cell.style.left = `${firstWidth}px`;
  });
}

function addRow() {
  const table = activeTable();
  table.rows.push({
    firstFilledAt: "",
    cells: Array.from({ length: table.columns.length }, () => ({ text: "", checked: false })),
  });
  saveState();
  renderTable();
}

function toggleEditMode() {
  state.editMode = !state.editMode;
  renderAll();
}

function deleteRow(event) {
  event.preventDefault();
  event.stopPropagation();
  const table = activeTable();
  const rowIndex = Number(event.currentTarget.dataset.row);
  table.rows.splice(rowIndex, 1);
  if (!table.rows.length) {
    table.rows.push({
      firstFilledAt: "",
      cells: Array.from({ length: table.columns.length }, () => ({ text: "", checked: false })),
    });
  }
  saveState();
  renderTable();
}

function deleteColumn(event) {
  event.preventDefault();
  event.stopPropagation();
  const table = activeTable();
  const columnIndex = Number(event.currentTarget.dataset.column);
  if (columnIndex < 2) return;
  table.columns.splice(columnIndex, 1);
  table.columnWidths.splice(columnIndex, 1);
  table.rows.forEach((row) => row.cells.splice(columnIndex, 1));
  saveState();
  renderTable();
}

function deleteCurrentTable() {
  const table = activeTable();
  const ok = window.confirm(`删除表格“${table.name}”？这个操作不能撤销。`);
  if (!ok) return;

  state.tables = state.tables.filter((item) => item.id !== table.id);
  if (!state.tables.length) {
    const next = createTable("工作进度表 1");
    state.tables.push(next);
  }
  state.activeId = state.tables[0].id;
  saveState();
  renderAll();
}

function newTable() {
  const table = createTable(`工作进度表 ${state.tables.length + 1}`);
  state.tables.push(table);
  state.activeId = table.id;
  saveState();
  renderAll();
  els.tableNameInput.focus();
  els.tableNameInput.select();
}

function renameTable() {
  const table = activeTable();
  table.name = els.tableNameInput.value.trim() || "未命名表格";
  saveState();
  renderTableSelect();
}

function switchTable() {
  state.activeId = els.tableSelect.value;
  saveState();
  renderAll();
}

function exportExcel() {
  // 过滤掉没有数据的空表格
  const nonEmptyTables = state.tables.filter(t => t.rows.length > 0 || t.columns.length > 0);
  if (nonEmptyTables.length === 0) {
    alert('没有可导出的数据，请先创建表格并添加内容。');
    return;
  }

  // 如果没有 XLSX 库，回退到 HTML 导出（只导出当前表格）
  if (!window.XLSX) {
    const table = activeTable();
    const data = [
      table.columns,
      ...table.rows.map((row) =>
        table.columns.map((_, columnIndex) => {
          const cell = row.cells[columnIndex] || { text: "", checked: false };
          return cell.checked ? `${cell.text} ✓`.trim() : cell.text;
        })
      ),
    ];
    const fileBase = sanitizeFileName(table.name || "工作进度表");
    const html = `<!doctype html><html><meta charset="utf-8"><body>${tableToHtml(data)}</body></html>`;
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    downloadBlob(blob, `${fileBase}.xls`);
    return;
  }

  // 创建一个新工作簿
  const workbook = XLSX.utils.book_new();
  // 记录已使用的 Sheet 名，处理重名
  const usedNames = new Set();

  nonEmptyTables.forEach(table => {
    // 构建数据：第一行是列头，后续是数据行
    const data = [
      table.columns,
      ...table.rows.map((row) =>
        table.columns.map((_, columnIndex) => {
          const cell = row.cells[columnIndex] || { text: "", checked: false };
          return cell.checked ? `${cell.text} ✓`.trim() : cell.text;
        })
      ),
    ];

    // 生成 Sheet 名（Excel 限制 31 字符）
    let sheetName = table.name.substring(0, 31);
    // 处理重名：如果已存在则加序号
    if (usedNames.has(sheetName)) {
      let counter = 2;
      let candidate;
      do {
        const suffix = ` (${counter})`;
        candidate = table.name.substring(0, 31 - suffix.length) + suffix;
        counter++;
      } while (usedNames.has(candidate));
      sheetName = candidate;
    }
    usedNames.add(sheetName);

    const worksheet = XLSX.utils.aoa_to_sheet(data);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  });

  // 文件名使用第一个非空表格的名称
  const fileBase = sanitizeFileName(nonEmptyTables[0].name || "工作进度表");
  XLSX.writeFile(workbook, `${fileBase}.xlsx`);
}
// 触发隐藏的文件选择器，让用户选择 Excel 文件导入
function openImportPicker() {
    els.importFileInput.click();
}

function importExcel(event) {
  const file = event.currentTarget.files[0];
  if (!file) return;

  if (!window.XLSX) {
    window.alert("Excel 导入组件还没有加载成功，请确认当前页面可以访问网络后刷新再试。");
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const workbook = XLSX.read(reader.result, { type: "array", cellDates: true });
      
      if (workbook.SheetNames.length === 0) {
        window.alert("文件中没有找到任何表格。");
        return;
      }

      let importedCount = 0;
      let firstImportedId = null;

      // 遍历所有 Sheet，每个 Sheet 恢复为一个表格
      workbook.SheetNames.forEach(sheetName => {
        const sheet = workbook.Sheets[sheetName];
        const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: "" });
        const cleaned = trimMatrix(matrix);
        
        // 跳过空 Sheet
        if (!cleaned.length) return;

        // 处理表格名冲突：如果已存在同名表格，加序号
        let tableName = sheetName;
        const nameExists = state.tables.some(t => t.name === tableName);
        if (nameExists) {
          let counter = 2;
          while (state.tables.some(t => t.name === `${sheetName} (${counter})`)) {
            counter++;
          }
          tableName = `${sheetName} (${counter})`;
        }

        const imported = tableFromMatrix(cleaned, tableName);
        state.tables.push(imported);
        if (!firstImportedId) {
          firstImportedId = imported.id;
        }
        importedCount++;
      });

      if (importedCount === 0) {
        window.alert("文件中没有可导入的数据。");
        return;
      }

      // 切换到第一个导入的表格
      state.activeId = firstImportedId;
      state.editMode = false;
      saveState();
      renderAll();
      
      window.alert(`成功导入 ${importedCount} 个表格！`);
    } catch (error) {
      console.error(error);
      window.alert("导入失败，请确认文件是普通 Excel / CSV 表格。");
    }
  };
  reader.readAsArrayBuffer(file);
}
function trimMatrix(matrix) {
  const rows = matrix
    .map((row) => row.map((cell) => String(cell ?? "").trimEnd()))
    .filter((row) => row.some((cell) => cell.trim()));

  let lastColumn = -1;
  rows.forEach((row) => {
    row.forEach((cell, index) => {
      if (cell.trim()) lastColumn = Math.max(lastColumn, index);
    });
  });

  if (lastColumn < 0) return [];
  return rows.map((row) => row.slice(0, lastColumn + 1));
}

function tableFromMatrix(matrix, sourceName) {
  const columnCount = Math.max(2, matrix[0].length);
  const columns = Array.from({ length: columnCount }, (_, index) => {
    if (matrix[0][index]) return String(matrix[0][index]);
    if (index === 0) return "第几周";
    if (index === 1) return "月 / 日 / 时";
    return `进度 ${index - 1}`;
  });

  const rows = matrix.slice(1).map((row) => ({
    firstFilledAt: "",
    cells: Array.from({ length: columnCount }, (_, columnIndex) => parseImportedCell(row[columnIndex])),
  }));

  return {
    id: uid(),
    name: sourceName || `导入表格 ${state.tables.length + 1}`,
    columns,
    columnWidths: makeColumnWidths(columnCount),
    rows: rows.length ? rows : makeRows(DEFAULT_ROWS, columnCount),
  };
}

function parseImportedCell(value) {
  const text = String(value ?? "");
  const checked = /✓\s*$/.test(text);
  return {
    text: checked ? text.replace(/\s*✓\s*$/, "") : text,
    checked,
  };
}

function tableToHtml(data) {
  const rows = data
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table>${rows}</table>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").slice(0, 80) || "工作进度表";
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

els.tableSelect.addEventListener("change", switchTable);
els.tableNameInput.addEventListener("change", renameTable);
els.tableNameInput.addEventListener("blur", renameTable);
els.newTableBtn.addEventListener("click", newTable);
els.importBtn.addEventListener("click", openImportPicker);
els.importFileInput.addEventListener("change", importExcel);
els.editModeBtn.addEventListener("click", toggleEditMode);
els.addColumnBtn.addEventListener("click", addColumn);
els.addRowBtn.addEventListener("click", addRow);
els.deleteTableBtn.addEventListener("click", deleteCurrentTable);
els.exportBtn.addEventListener("click", exportExcel);

loadState();
renderAll();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((error) => {
      console.warn("Service worker registration failed:", error);
    });
  });
}
