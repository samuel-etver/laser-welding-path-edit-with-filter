const electron = require('electron');
const ipc = electron.ipcRenderer;
const tabulator = require('tabulator-tables');
const constants = require('./constants.js');
const filters = require('./path_filter.js');

var readButton;
var writeButton;
var yOffsetButton;
var zoomButton;
var dragButton;
var clearSelectionButton;
var chartButtonsPanel;
var allDotsCountLabel;
var badDotsCountLabel;
var goodDotsCountLabel;
var yScan = {
  originalWeldingPathData: [],
  modifiedWeldingPathData: [],
  yOffset: 0,
  pathChart: undefined,
  pathTable: undefined,
  chartSelection: {
    x0: null,
    x1: null,
    index0: null,
    index1: null,
    state: null,
    yMove: 0
  },
  tableSelection: {
    fromIndex: null,
    toIndex: null
  }
};
var draggedDotIndex;
var ctrlKey;
var dragStartY;

window.onload = function() {
  ipc.on('set-path-data', (event, arg) => {
    yScan.originalWeldingPathData = arg;
    filterPath(arg);
    refreshWeldingPathTable(arg);
    refreshPathChart(arg);
    refreshDotsCountLabels(arg);
  });

  ipc.on('get-path-data', () => {
    readModifiedWeldingPathData();
    ipc.send('get-path-data-reply', yScan.modifiedWeldingPathData);
  });
  ipc.on('open-options-dialog', () => onOpenOptionsDialog());
  ipc.on('open-error-dialog', (event, arg) => onOpenErrorDialog(arg));
  ipc.on('open-write-success-dialog', () => onOpenWriteSuccessDialog());

  yOffsetButton = document.getElementById('y-offset-button');
  yOffsetButton.addEventListener('click', () => onOpenYOffsetDialog())

  readButton = document.getElementById('read-button');
  readButton.addEventListener('click', readPathFromSimatic);

  writeButton = document.getElementById('write-button');
  writeButton.addEventListener('click', onWriteButtonClick);

  var resetModificationButton = document.getElementById('reset-modification-button');
  resetModificationButton.addEventListener('click', () => {
    openConfirmationDialog(
      'Все изменения будут потеряны. Продолжить?',
      resetModifiedPathData
    );
  });

  var resetZoomButton = document.getElementById('reset-zoom-button');
  resetZoomButton.addEventListener('click', resetZoom);

  var exitButton = document.getElementById('exit-button');
  exitButton.addEventListener('click', () => window.close());

  zoomButton = document.getElementById('zoom-button');
  zoomButton.addEventListener('click', onChartButtonClick);

  dragButton = document.getElementById('drag-button');
  dragButton.addEventListener('click', onChartButtonClick);

  clearSelectionButton = document.getElementById("clear-selection-button");
  clearSelectionButton.addEventListener('click', onClearSelectionButtonClick);

  chartButtonsPanel = document.getElementById('chart-buttons-panel');

  allDotsCountLabel = document.getElementById('all-dots-count-label');
  badDotsCountLabel = document.getElementById('bad-dots-count-label');
  goodDotsCountLabel = document.getElementById('good-dots-count-label');

  $.jqplot.config.enablePlugins = true;
  yScan.pathChart = $.jqplot('path-chart',  [ [,], [,], [,] ],
    {
      captureRightClick : true,
      seriesDefaults: {
        shadow: false,
        lineWidth: 1,
      },
      series: [
        {
          color: '#ff55cc',
          label: 'Исходная',
          lineWidth: 1,
          showMarker: false,
        },
        {
          color: '#ffffff',
          label: 'Модифицированная',
          showMarker: true,
          markerOptions: {
            shadow: false,
            size: 7,
            color: '#ffaa88'
          },
        },
        {
          color: '#9999ff',
          label: 'После фильтра',
          lineWidth: 3,
          showMarker: false,
        }
      ],
      cursor: {
        style: 'auto',
        zoom: true,
        tooltipLocation: 'sw'
      },
      axes: {
        xaxis: {
          pad: 0,
          rendererOptions: {
            forceTickAt0: true
          }
        }
      },
      highlighter: {
        sizeAdjust: 10,
        tooltipLocation: 'n',
        tooltipAxes: 'y',
        tooltipFormatString: '%.3f',
        useAxesFormatters: false,
      },
      grid: {
        shadow: false,
        borderWidth: 0,
        background: 'black',
        gridLineColor: '#555555',
      },
      gridPadding: {
        top:    22,
        bottom: 24,
        left:   80,
        right:  20
      },
      legend: {
          show: true,
          location: 'nw',
          renderer: $.jqplot.EnhancedLegendRenderer,
          rendererOptions: {
              numberColumns: 3,
              seriesToggleReplot: true,
          }
      },
      canvasOverlay: {
        show: true,
        objects: [
          {
             rectangle: {
               xmin: -1001,
               xmax: -1000,
               xminOffset: "0px",
               xmaxOffset: "0px",
               yminOffset: "0px",
               ymaxOffset: "0px",
               color: "rgba(0, 200, 200, 0.3)",
               showTooltip: false
             }
          },
          {
            verticalLine: {
              x: -1000,
              yminOffset: '0px',
              ymaxOffset: '0px',
              lineWidth: 3,
              color: 'rgba(0, 200, 200)',
              shadow: false
            }
          }
        ]
      }
    }
  );

  yScan.pathChart.series[0].plugins.draggable = undefined;
  yScan.pathChart.series[1].plugins.draggable.constrainTo = 'y';
  yScan.pathChart.series[2].plugins.draggable = undefined;

  $('#path-chart').on('jqplotDragStart', onDragStartPathChart);
  $('#path-chart').on('jqplotDragStop', () => { onDragStopPathChart(draggedDotIndex); });
  $('#path-chart').on('jqplotClick', onChartClick);
  $('#path-chart').on('jqplotRightClick', onChartContextMenu);

  yScan.pathChart.mx = {
    options: {
      draggablePlugin: yScan.pathChart.series[1].plugins.draggable,
      zoomPlugin:      yScan.pathChart.plugins.cursor._zoom,
    }
  }

  setChartState();

  var columnYFormatter =  (cell, formatterParams, onRendered) => {
    var value = cell.getValue();
    if ( value === undefined ) {
      return '';
    }
    return parseFloat(cell.getValue()).toFixed(3);
  };
  var columnXWidth = 59;
  var columnYWidth = columnXWidth;


  yScan.pathTable = new tabulator("#path-table", {
    autoResize: true,
    rowContextMenu: [
      {
        label: "Установить статус",
        action: onSetStatusClick
      },
      {
        label: "Установить в диапазоне...",
        action: onSetStatusInRangeClick
      },
      {
        label: "Установить всем",
        action: onSetStatusForAllClick
      },
      {
        separator: true
      },
      {
        label: "Сбросить статус",
        action: onClearStatusClick
      },
      {
        label: "Сбросить в диапазоне...",
        action: onClearStatusInRangeClick
      },
      {
        separator: true
      },
      {
        label: "Снять выделение",
        action: onClearRowsSelectionClick
      }
    ],
    selectable: true,
    rowClick: function(e, row) {
      row.deselect();
    },
    columns:[
      {
        title: "ИНД",
        field: "index",
        align: "right",
        width: 48,
        headerSort: false
      },

      {
        title: "X,мм",
        field: "x",
        align: "right",
        width: columnXWidth,
        headerSort: false
      },

      {
        title: "Y,мм",
        field: "y",
        align: "right",
        width: columnYWidth,
        formatter: columnYFormatter,
        editor: "input",
        headerSort: false
      },

      {
        title: "Yф,мм",
        field: "filteredY",
        align: "right",
        width: columnYWidth,
        formatter: columnYFormatter,
        headerSort: false
      },

      {
        title: "СТАТУС",
        field: "valid",
        align: "center",
        width: 72,
        formatter:
        function(cell, formatterParams, onRendered) {
          return this.formatters['tickCross'](cell, formatterParams, onRendered);
        },
        editor: 'tickCross',
        headerSort: false
      },
    ],
    dataEdited: onPathTableDataEdited,
  });

  prepareDialogs();

  window.addEventListener('resize', event => onResizeWindow(event));
  onResizeWindow()
}


function readPathFromSimatic() {
  ipc.on('read-path-reply', (event, arg) => {
    yScan.originalWeldingPathData = arg;
    filterPath(arg);
    refreshWeldingPathTable(arg);
    refreshPathChart(arg);
    refreshDotsCountLabels(arg);
  });

  ipc.send('read-path', "");
}


window.onkeydown = function(event) {
  if (event.keyCode == 17) {
    ctrlKey = true;
  }
}


window.onkeyup = function(event) {
  if(event.keyCode == 17) {
    ctrlKey = false;
  }
}


function onWriteButtonClick() {
  var globalVars = ipc.sendSync('get-global', [
    'controllerIp',
    'blockNumber',
    'yArrayAddress',
    'yStatusArrayAddress',
    'numberOfDotsAddress'
  ]);

  var idPrefix = 'write-confirmation-modal-dialog-';
  var setVar = function(name, value, valuePrefix) {
  var el = document.getElementById(idPrefix + name);
  el.innerHTML =
    '<b>' +
    (value ? (valuePrefix ? valuePrefix : '') + value : '?') +
    '</b>';
  }

  setVar('ip', globalVars.controllerIp);
  setVar('block-number', globalVars.blockNumber, 'DB');
  setVar('number-of-dots-address', globalVars.numberOfDotsAddress);
  setVar('y-array-address', globalVars.yArrayAddress);
  setVar('y-status-array-address', globalVars.yStatusArrayAddress);

  $('#write-confirmation-modal-dialog').modal('show');
}


function writePathToSimatic() {
  var el = document.getElementById('write-confirmation-modal-dialog-path-select');
  ipc.sendSync('set-global', {
    writePathType: (el.value == '1' ? 'before' : 'after'),
  });
  readModifiedWeldingPathData();
  filterPath(yScan.modifiedWeldingPathData);
  ipc.send('write-path', yScan.modifiedWeldingPathData);
}


function refreshWeldingPathTable(pathData) {
  var index = 0;
  var tableData = [];
  var kX = constants.kX;
  for (item of pathData) {
    var x = index * kX;
    tableData.push({
      index: index,
       x: x,
       y: item.y,
       filteredY: item.filteredY,
       valid: item.status != 0,
    });
    index++;
  }
  yScan.pathTable.replaceData(tableData);
}


function readModifiedWeldingPathData() {
  var data = yScan.pathTable.getData()
  yScan.modifiedWeldingPathData = [];
  for (item of data) {
    yScan.modifiedWeldingPathData.push({
      y: item.y,
      status: (item.valid ? 1 : 0)
    });
  }
}


function resetModifiedPathData() {
  yScan.yOffset = 0;
  var newModified = [];
  for (var item of yScan.originalWeldingPathData) {
    newModified.push( [].concat(item) );
  }
  yScan.modifiedWeldingPathData = yScan.originalWeldingPathData;
  new Promise(() => {
    refreshPathChart(yScan.originalWeldingPathData);
    refreshWeldingPathTable(yScan.originalWeldingPathData);
    refreshDotsCountLabels(yScan.originalWeldingPathData);
  });
}


function refreshPathChart(weldingData, options) {
  var originalData = [];
  var seriesData = [];
  var filteredData = [];
  var count = weldingData.length;
  var kX = 1; //constants.kX;

  for (var i = 0; i < count; i++) {
    var item = weldingData[i];
    var x = kX*i;
    var status = item.status;
    if ( status ) {
      seriesData.push( [x, item.y] );
    }
    if ( item.filteredY !== undefined ) {
      filteredData.push( [x, item.filteredY] );
    }
  }

  count = yScan.originalWeldingPathData.length;
  for(i = 0; i < count; i++) {
    item = yScan.originalWeldingPathData[i];
    x = kX*i;
    if(item.status) {
      originalData.push( [x, item.y]);
    }
  }


  yScan.pathChart.series[0].data = originalData;
  yScan.pathChart.series[1].data = seriesData;
  yScan.pathChart.series[2].data = filteredData;

  new Promise(() => {
    var resetAxes = true;
    if ( options && options.resetAxes !== undefined) {
      resetAxes = options.resetAxes;
    }
    yScan.pathChart.replot( {resetAxes: resetAxes}  );
  });
}

function filterPath(weldingData) {
  var arrIn = [];
  var arrStatus = [];
  for (var item of weldingData) {
    arrIn.push( item.y );
    arrStatus.push( item.status );
  }
  var arrOut = filters.filterPath(
    'diff',
    {
        arrIn: arrIn,
        arrStatus: arrStatus
    },
    {
      deltaYmax: 0.01,
    }
  );


  var n = arrIn.length;
  var offset = parseFloat(yScan.yOffset);
  if ( isNaN(offset) ) {
    offset = 0;
  }
  for (var i = 0; i < n; i++) {
    weldingData[i].filteredY = arrOut[i] + offset;
  }
}

function onResizeWindow() {
  yScan.pathChart.replot();
}


function resetZoom() {
  var activateZoom = false;
  if ( !yScan.pathChart.plugins.cursor._zoom ) {
    yScan.pathChart.plugins.cursor._zoom = yScan.pathChart.mx.options.zoomPlugin;
    activateZoom = true;
  }

  yScan.pathChart.resetZoom();

  if ( activateZoom ) {
    yScan.pathChart.plugins.cursor._zoom = undefined;
  }

  yScan.pathChart.replot ( { resetAxes: true} );
}


function onDragStartPathChart(ev, seriesIndex, pointIndex) {
  draggedDotIndex = pointIndex;
  dragStartY = yScan.pathChart.series[1].data[pointIndex][1];
}


function onDragStopPathChart(dotChartIndex) {
  var dot = yScan.pathChart.series[1].data[dotChartIndex];
  var draggedX = dot[0];
  var draggedY = dot[1];
  var draggedDeltaY = draggedY - dragStartY;
  var draggedRegion = false;
  var tableData = yScan.pathTable.getData();
  var kX = 1; // constants.kX
  var dotTableIndex;

  if(yScan.chartSelection.state == 'rect') {
    draggedRegion = yScan.chartSelection.x0 <= draggedX &&
                    yScan.chartSelection.x1 >= draggedX;
  }

  if (draggedRegion) {
    var x = yScan.chartSelection.x0;
    var x1 = yScan.chartSelection.x1;
    dotTableIndex = Math.round(x/kX);
    while(x < x1) {
      if(tableData[dotTableIndex].valid) {
        tableData[dotTableIndex].y += draggedDeltaY;
      }
      if(++dotTableIndex >= tableData.length) {
        break;
      }
      x = dotTableIndex;
    }
  }
  else {
    dotTableIndex = Math.round(draggedX/kX);
    tableData[dotTableIndex].y = draggedY;
  }

  new Promise(() => {
    yScan.pathTable.replaceData(tableData);
    readModifiedWeldingPathData();
    filterPath(yScan.modifiedWeldingPathData);
    refreshWeldingPathTable(yScan.modifiedWeldingPathData);
    refreshPathChart(yScan.modifiedWeldingPathData, {
      resetAxes: false,
    });
  });
}


function onOpenDotsCountDialog() {
  var input = document.getElementById('dots-count-modal-input');
  readModifiedWeldingPathData();
  input.value = yScan.modifiedWeldingPathData.length;
  $('#dots-count-modal-dialog').modal('show');
}


function onDotsCountDialogOkClick() {
  var input = document.getElementById('dots-count-modal-input');
  var newSize = parseInt(input.value);
  if ( !isNaN(newSize) && newSize >= 0 ) {
    if ( newSize > constants.dotsCountMax ) {
      newSize = constants.dotsCountMax;
    }
    if ( newSize != yScan.modifiedWeldingPathData.length ) {
      allDotsCountLabel.textContent = newSize;
      new Promise(() => {
        resizeWeldingData(newSize);
      });
    }
  }
  $('#dots-count-modal-dialog').modal('hide');
}


function onPathTableDataEdited(data) {
  new Promise(() => {
    readModifiedWeldingPathData();
    filterPath(yScan.modifiedWeldingPathData);
    refreshPathChart(yScan.modifiedWeldingPathData, { resetAxes: false });
    refreshWeldingPathTable(yScan.modifiedWeldingPathData);
    refreshDotsCountLabels(yScan.modifiedWeldingPathData);
  });
}

function resizeWeldingData(newSize) {
  if ( newSize < yScan.modifiedWeldingPathData.length ) {
    while ( newSize < yScan.modifiedWeldingPathData.length ) {
      yScan.modifiedWeldingPathData.pop();
    }
  }
  else {
    while ( yScan.modifiedWeldingPathData.length < newSize ) {
      yScan.modifiedWeldingPathData.push({
        y: 0.0,
        status: 1
      });
    }
  }

  filterPath(yScan.modifiedWeldingPathData);
  refreshWeldingPathTable(yScan.modifiedWeldingPathData);
  refreshPathChart(yScan.modifiedWeldingPathData);
  refreshDotsCountLabels(yScan.modifiedWeldingPathData);
}


function refreshDotsCountLabels(data) {
  allDotsCountLabel.textContent = data.length;

  var goodDots = 0;
  for (var item of data) {
    if ( item.status ) {
      goodDots++;
    }
  }
  goodDotsCountLabel.textContent = goodDots;

  var badDots = data.length - goodDots;
  badDotsCountLabel.textContent = badDots;
}



function onOpenOptionsDialog() {
  var globalVars = ipc.sendSync('get-global', [
    'controllerIp',
    'blockNumber',
    'yArrayAddress',
    'yStatusArrayAddress',
    'numberOfDotsAddress'
  ]);

  var ipInput = document.getElementById('ip-input');
  ipInput.value = globalVars.controllerIp;

  var blockNumberInput = document.getElementById('block-number-input');
  blockNumberInput.value = globalVars.blockNumber;

  var yArrayAddressInput = document.getElementById('y-array-address-input');
  yArrayAddressInput.value = globalVars.yArrayAddress;

  var yStatusArrayAddressInput = document.getElementById('y-status-array-address-input');
  yStatusArrayAddressInput.value = globalVars.yStatusArrayAddress;

  var numberOfDotsAddressInput = document.getElementById('number-of-dots-address-input');
  numberOfDotsAddressInput.value = globalVars.numberOfDotsAddress;

  $('#options-modal-dialog').modal('show');
}


function onOptionsDialogOkClick() {
  var ipInput = document.getElementById('ip-input');
  var blockNumberInput = document.getElementById('block-number-input');
  var yArrayAddressInput = document.getElementById('y-array-address-input');
  var yStatusArrayAddressInput = document.getElementById('y-status-array-address-input');
  var numberOfDotsAddressInput = document.getElementById('number-of-dots-address-input');

  ipc.sendSync('set-global', {
    controllerIp: ipInput.value,
    blockNumber:  blockNumberInput.value,
    yArrayAddress:       yArrayAddressInput.value,
    yStatusArrayAddress: yStatusArrayAddressInput.value,
    numberOfDotsAddress: numberOfDotsAddressInput.value,
  });

  $('#options-modal-dialog').modal('hide');
}


function onOpenErrorDialog(msg) {
  var el = document.getElementById('error-modal-body');
  el.innerHTML = msg;
  $('#error-modal-dialog').modal('show');
}


function onOpenWriteSuccessDialog() {
  $('#write-success-modal-dialog').modal('show');
}


function openConfirmationDialog(msg, func) {
  document.getElementById('confirmation-modal-body').innerHTML = msg;
  document.getElementById('confirmation-modal-dialog-yes-button').onclick = () => { func&&func(); };
  $('#confirmation-modal-dialog').modal('show');
}

function onChartButtonClick() {
  setChartState();
}

function setChartState() {
  var zoomActivated = document.getElementById('chart-zoom-state').checked;
  var dragActivated = document.getElementById('chart-drag-state').checked;

  yScan.pathChart.series[1].plugins.draggable = dragActivated
   ? yScan.pathChart.mx.options.draggablePlugin
   : undefined;
  yScan.pathChart.plugins.cursor._zoom = zoomActivated
   ? yScan.pathChart.plugins.cursor._zoom = yScan.pathChart.mx.options.zoomPlugin
   : undefined;
}


function onOpenYOffsetDialog() {
  var input = document.getElementById('y-offset-modal-input');
  input.value = yScan.yOffset;
  $('#y-offset-modal-dialog').modal('show');
}


function onYOffsetDialogOkClick() {
  var input = document.getElementById('y-offset-modal-input');
  yScan.yOffset = input.value;
  $('#y-offset-modal-dialog').modal('hide');
  new Promise(() => {
    readModifiedWeldingPathData();
    filterPath(yScan.modifiedWeldingPathData);
    refreshWeldingPathTable(yScan.modifiedWeldingPathData);
    refreshPathChart(yScan.modifiedWeldingPathData, {
      resetAxes: false,
    });
  });
}


function prepareDialogs() {
  let dialogList = $(".modal");
  for(let dialog of dialogList) {
    if(dialog.id) {
      let id = '#' + dialog.id;
      let firstEl = dialog.querySelector(".first-focus");
      let defaultEl = dialog.querySelector(".default-control");

      let elementsList = Array.from(dialog.getElementsByClassName("focusable"));
      if (elementsList.length && !firstEl) {
        firstEl = elementsList[0];
      }

      $(id).on('shown.bs.modal', function() {
        firstEl && firstEl.focus();
      });

      $(id).keydown(function(event) {
        let focusEl = document.activeElement;

        if (event.which == 9) {
          event.preventDefault();
          let oldIndex = elementsList.findIndex(el => el == focusEl);
          let index = oldIndex;

          let getNext = function(index) {
            if (index >= 0) {
              if (event.shiftKey) {
                if (--index < 0) {
                  index = elementsList.length - 1;
                }
              }
              else {
                if (++index >= elementsList.length) {
                  index = 0;
                }
              }
            }
            return index < 0 ? 0 : index;
          }

          do {
            index = getNext(index);
            var nextEl = elementsList[index];
            let style = getComputedStyle(nextEl);
            if (style.visibility != 'hidden' &&
                style.opacity &&
                nextEl.clientWidth &&
                nextEl.clientHeight) {
              break;
            }
          } while(index != oldIndex);

          nextEl.focus();
        }

        if (event.which == 13 && defaultEl) {
          switch(focusEl.tagName.toLowerCase()) {
            case "button":
            case "select":
              break;
            default:
              event.preventDefault();
              defaultEl.click();
          }
        }
      });
    }
  }
}


function onClearSelectionButtonClick() {
  if (!yScan.chartSelection.state) {
    $('#chart-selection-info-modal-dialog').modal('show');
  }
  else {
    yScan.chartSelection.state = null;
    let objects = yScan.pathChart.plugins.canvasOverlay.objects;
    let rect = objects[0];
    let line = objects[1];
    rect.options.xmin = -1001;
    rect.options.xmax = -1000;
    line.options.x = -1000;
    yScan.pathChart.replot();
  }
}


function onSetStatusClick() {
  refreshAll(function() {
    let allRows = yScan.pathTable.getSelectedRows();
    for(let row of allRows) {
      var index = row.getPosition();
      yScan.modifiedWeldingPathData[index].status = 1;
    }
  });
}


function onSetStatusForAllClick() {
  refreshAll(function() {
    for(let item of yScan.modifiedWeldingPathData) {
      item.status = 1;
    }
  });
}


function onClearStatusClick() {
  refreshAll(function() {
    let allRows = yScan.pathTable.getSelectedRows();
    for(let row of allRows) {
      var index = row.getPosition();
      yScan.modifiedWeldingPathData[index].status = 0;
    }
  });
}


function onClearRowsSelectionClick() {
  yScan.pathTable.deselectRow();
}


function refreshAll(cb) {
  new Promise(() => {
    readModifiedWeldingPathData();
    if (cb) {
      cb();
    }
    filterPath(yScan.modifiedWeldingPathData);
    refreshPathChart(yScan.modifiedWeldingPathData);
    refreshWeldingPathTable(yScan.modifiedWeldingPathData);
    refreshDotsCountLabels(yScan.modifiedWeldingPathData);
  });
}


function onSetStatusInRangeClick(status) {
  if (status === undefined) {
    status = true;
  }

  var titleEl = document.getElementById("set-clear-status-in-range-title");
  titleEl.innerHTML = status
    ? "Установить статус"
    : "Сбросить статус";

  var okButton = document.getElementById("set-clear-status-in-range-ok-button");
  okButton.onclick = () => onSetStatusInRangeDialogOkClick(status);

  var fromInput = document.getElementById("set-clear-status-in-range-from-input");
  fromInput.value = yScan.tableSelection.fromIndex;

  var toInput = document.getElementById("set-clear-status-in-range-to-input");
  toInput.value = yScan.tableSelection.toIndex;

  $('#set-clear-status-in-range-modal-dialog').modal('show');
}


function onClearStatusInRangeClick() {
  onSetStatusInRangeClick(false);
}


function onSetStatusInRangeDialogOkClick(status) {
  $('#set-clear-status-in-range-modal-dialog').modal('hide');

  var fromInput = document.getElementById("set-clear-status-in-range-from-input");
  yScan.tableSelection.fromIndex = fromInput.value;

  var toInput = document.getElementById("set-clear-status-in-range-to-input");
  yScan.tableSelection.toIndex = toInput.value;

  var fromIndex = parseInt(yScan.tableSelection.fromIndex);
  var toIndex = parseInt(yScan.tableSelection.toIndex);

  if (!isNaN(fromIndex) && !isNaN(toIndex)) {
    if (fromIndex < 0) {
      fromIndex = 0;
    }
    refreshAll(function() {
      if (toIndex >= yScan.modifiedWeldingPathData.length) {
        toIndex = yScan.modifiedWeldingPathData.length - 1;
      }
      for(let i = fromIndex; i <= toIndex; i++) {
        yScan.modifiedWeldingPathData[i].status = status;
      }
    });
  }
}


function onChartClick(event, gridPos, dataPos) {
  if(ctrlKey) {
    let objects = yScan.pathChart.plugins.canvasOverlay.objects;
    let rect = objects[0];
    let line = objects[1];
    let x = dataPos.xaxis;

    switch(yScan.chartSelection.state) {
      case null:
      case 'rect':
        rect.options.xmin = -1001;
        rect.options.xmax = -1000;
        line.options.x = x;
        yScan.chartSelection.x0 = x;
        yScan.chartSelection.x1 = x;
        yScan.chartSelection.state = 'line';
        break;
      case 'line':
        line.options.x = -1000;
        yScan.chartSelection['x' + (x < yScan.chartSelection.x0 ? '0' : '1')] = x;
        rect.options.xmin = yScan.chartSelection.x0;
        rect.options.xmax = yScan.chartSelection.x1;
        yScan.chartSelection.state = 'rect';
    }

    yScan.pathChart.replot();
  }
}


function onChartContextMenu(event) {
  var top = event.pageY - 10;
  var left = event.pageX - 10;

  $("#chart-context-menu").css({
    display: "block",
    top: top,
    left: left
  }).addClass("show");

  $('body').one("click", function() {
    $("#chart-context-menu").removeClass("show").hide();
  });
}


function onChartSelectionYMoveClick() {
  var yMoveEl = document.getElementById('chart-selection-y-move-modal-input');
  yMoveEl.value = yScan.chartSelection.yMove;

  $('#chart-selection-y-move-modal-dialog').modal('show');
}


function onChartSelectionYMoveDialogOkClick() {
  $('#chart-selection-y-move-modal-dialog').modal('hide');

  var yMoveEl = document.getElementById('chart-selection-y-move-modal-input');
  yScan.chartSelection.yMove = yMoveEl.value;

  var yMove = parseFloat(yScan.chartSelection.yMove);
  if (isNaN(yMove) ||
      yScan.chartSelection.state != 'rect') {
    return;
  }

  var x = yScan.chartSelection.x0;
  var x1 = yScan.chartSelection.x1;
  var tableData = yScan.pathTable.getData();
  var kX = 1; // constants.kX
  var dotTableIndex = Math.round(x/kX);
  while(x < x1) {
    var item = yScan.originalWeldingPathData[dotTableIndex];
    tableData[dotTableIndex].valid = item.status != 0;
    tableData[dotTableIndex].y = item.y;
    if (tableData[dotTableIndex].valid) {
      tableData[dotTableIndex].y += yMove;
    }
    if(++dotTableIndex >= tableData.length) {
      break;
    }
    x = dotTableIndex;
  }

  new Promise(() => {
    yScan.pathTable.replaceData(tableData);
    readModifiedWeldingPathData();
    filterPath(yScan.modifiedWeldingPathData);
    refreshWeldingPathTable(yScan.modifiedWeldingPathData);
    refreshPathChart(yScan.modifiedWeldingPathData, {
      resetAxes: false,
    });
  });
}


function onChartRangeSelectionClick() {
  var fromEl = document.getElementById('chart-range-selection-from-input');
  fromEl.value = yScan.chartSelection.index0;

  var toEl = document.getElementById('chart-range-selection-to-input');
  toEl.value = yScan.chartSelection.index1;

  $('#chart-range-selection-modal-dialog').modal('show');
}


function onChartRangeSelectionDialogOkClick() {
  $('#chart-range-selection-modal-dialog').modal('hide');

  var fromEl = document.getElementById('chart-range-selection-from-input');
  yScan.chartSelection.index0 = fromEl.value;

  var toEl = document.getElementById('chart-range-selection-to-input');
  yScan.chartSelection.index1 = toEl.value;

  var index0 = parseFloat(yScan.chartSelection.index0);
  var index1 = parseFloat(yScan.chartSelection.index1);

  var correctSelection = !isNaN(index0) && !isNaN(index1) && index0 < index1;

  var kX = 1.0;

  var objects = yScan.pathChart.plugins.canvasOverlay.objects;
  var rect = objects[0];
  var line = objects[1];

  line.options.x = -1000;

  if (correctSelection) {
    yScan.chartSelection.state = 'rect';
    yScan.chartSelection.x0 = kX * index0;
    yScan.chartSelection.x1 = kX * index1;
    rect.options.xmin = yScan.chartSelection.x0;
    rect.options.xmax = yScan.chartSelection.x1;
  }
  else {
    yScan.chartSelection.state = null;
    rect.options.xmin = -1001;
    rect.options.xmax = -1000;
  }

  yScan.pathChart.replot();
}
