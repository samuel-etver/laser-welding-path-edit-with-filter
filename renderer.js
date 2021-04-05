const electron = require('electron');
const ipc = electron.ipcRenderer;
const tabulator = require('tabulator-tables');
const constants = require('./constants.js');
const filters = require('./path_filter.js');

var readButton;
var yScan = {
  name: 'yScan',
  allDotsCountLabel: undefined,
  badDotsCountLabel: undefined,
  goodDotsCountLabel: undefined,
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
  },
  createPage: function() {
    createScanPage(this);
  }
};

var zScan = Object.assign({}, yScan);
for (let fieldName of ['chartSelection', 'tableSelection']) {
  zScan[fieldName] = Object.assign({}, yScan[fieldName]);
}
zScan.name = 'zScan';

var yzScan = {
  name: 'yzScan',
  createPage: function() {
  }
}

var activeScan = yScan;

var draggedDotIndex;
var ctrlKey;
var dragStartY;

window.onload = function() {
  ipc.on('set-path-data', (event, arg) => {
    var scan = yScan;
    scan.originalWeldingPathData = arg;
    scan.modifiedWeldingPathData = arg;
    filterPath(scan);
    refreshWeldingPathTable(scan);
    refreshPathChart(scan);
    refreshDotsCountLabels(scan);
  });

  ipc.on('get-path-data', () => {
    ipc.send('get-path-data-reply', {
      yScan: yScan.modifiedWeldingPathData,
      zScan: zScan.modifiedWeldingPathData
    });
  });
  ipc.on('open-options-dialog', () => onOpenOptionsDialog());
  ipc.on('open-error-dialog', (event, arg) => onOpenErrorDialog(arg));
  ipc.on('open-write-success-dialog', () => onOpenWriteSuccessDialog());

  readButton = document.getElementById('read-button');
  readButton.addEventListener('click', readPathFromSimatic);

  var writeButton = document.getElementById('write-button');
  writeButton.addEventListener('click', onWriteButtonClick);

  var resetModificationButton = document.getElementById('reset-modification-button');
  resetModificationButton.addEventListener('click', () => {
    openConfirmationDialog(
      'Все изменения будут потеряны. Продолжить?',
      onResetModifiedPathData
    );
  });

  var resetZoomButton = document.getElementById('reset-zoom-button');
  resetZoomButton.addEventListener('click', resetZoom);

  var exitButton = document.getElementById('exit-button');
  exitButton.addEventListener('click', () => window.close());

  yScan.createPage();
  setChartState();

  prepareDialogs();

  $('a[data-toggle="tab"]').on('shown.bs.tab', onChangeScanTabs);

  window.addEventListener('resize', event => onResizeWindow(event));

  onResizeWindow()
}


function createScanPage(scan) {
  let prefix = scan.name.toLowerCase() + '-';

  let yOffsetButton = document.getElementById(prefix + 'y-offset-button');
  yOffsetButton.addEventListener('click', () => onOpenYOffsetDialog())

  let zoomButton = document.getElementById(prefix + 'zoom-button');
  zoomButton.addEventListener('click', onChartButtonClick);

  let dragButton = document.getElementById(prefix + 'drag-button');
  dragButton.addEventListener('click', onChartButtonClick);

  let clearSelectionButton = document.getElementById(prefix + "clear-selection-button");
  clearSelectionButton.addEventListener('click', onClearSelectionButtonClick);

  scan.allDotsCountLabel = document.getElementById(prefix + 'all-dots-count-label');
  scan.badDotsCountLabel = document.getElementById(prefix + 'bad-dots-count-label');
  scan.goodDotsCountLabel = document.getElementById(prefix + 'good-dots-count-label');

  buildPathChart(scan);
  buildPathTable(scan);

  scan.pageCreated = true;
}


function buildPathChart(scan) {
  let prefix = scan.name.toLowerCase() + '-';

  $.jqplot.config.enablePlugins = true;

  scan.pathChart = $.jqplot(prefix + 'path-chart',  [ [,], [,], [,] ],
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

  var series = scan.pathChart.series;
  series[0].plugins.draggable = undefined;
  series[1].plugins.draggable.constrainTo = 'y';
  series[2].plugins.draggable = undefined;

  var pathChartRef =   $('#' + prefix + 'path-chart');

  pathChartRef.on('jqplotDragStart', onDragStartPathChart);
  pathChartRef.on('jqplotDragStop', () => { onDragStopPathChart(draggedDotIndex); });
  pathChartRef.on('jqplotClick', onChartClick);
  pathChartRef.on('jqplotRightClick', onChartContextMenu);

  scan.pathChart.mx = {
    options: {
      draggablePlugin: scan.pathChart.series[1].plugins.draggable,
      zoomPlugin:      scan.pathChart.plugins.cursor._zoom,
    }
  }
}


function buildPathTable(scan) {
  var columnYFormatter =  (cell, formatterParams, onRendered) => {
    var value = cell.getValue();
    if ( value === undefined ) {
      return '';
    }
    return parseFloat(cell.getValue()).toFixed(3);
  };
  var columnXWidth = 59;
  var columnYWidth = columnXWidth;

  var tableId = '#' + scan.name.toLowerCase() + '-path-table';
  scan.pathTable = new tabulator(tableId, {
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
}


function readPathFromSimatic() {
  ipc.on('read-path-reply', (event, arg) => {
    var scan = yScan;
    scan.originalWeldingPathData = arg;
    scan.modifiedWeldingPathData = arg;
    filterPath(scan);
    refreshWeldingPathTable(scan);
    refreshPathChart(scan);
    refreshDotsCountLabels(scan);
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
  var globalVarNames = [
    'controllerIp'
  ];
  var allScans = [
    yScan,
    zScan
  ];
  for (let scan of allScans) {
    let prefix = scan.name + '.';
    globalVarNames.push(
      prefix + 'blockNumber',
      prefix + 'yArrayAddress',
      prefix + 'yStatusArrayAddress',
      prefix + 'numberOfDotsAddress'
    );
  }
  var globalVars = ipc.sendSync('get-global', globalVarNames);


  var idPrefix = 'write-confirmation-modal-dialog-';
  var setVar = function(scanName, name, value, valuePrefix) {
    var elName = idPrefix + (scanName ? scanName.toLowerCase() + '-' : '') + name;
    var el = document.getElementById(elName);
    el.innerHTML =
      '<b>' +
      (value ? (valuePrefix ? valuePrefix : '') + value : '?') +
      '</b>';
  };

  setVar(undefined, 'ip', globalVars.controllerIp);
  var allScans = [
    yScan,
    zScan
  ];
  for (let scan of allScans) {
    var scanName = scan.name;
    setVar(scanName, 'block-number', globalVars[scanName + '.blockNumber'], 'DB');
    setVar(scanName, 'number-of-dots-address', globalVars[scanName + '.numberOfDotsAddress']);
    setVar(scanName, 'y-array-address', globalVars[scanName + '.yArrayAddress']);
    setVar(scanName, 'y-status-array-address', globalVars[scanName + '.yStatusArrayAddress']);
  }

  $('#write-confirmation-modal-dialog').modal('show');
}


function writePathToSimatic() {
  var globalVars = {};
  var allScans = [yScan, zScan];
  for (var scan of allScans) {
    var name = scan.name;
    var el = document.getElementById('write-confirmation-modal-dialog-' +
      name.toLowerCase() + '-path-select');
      globalVars[name + '.writePathType'] = el.value == '1' ? 'before' : 'after';
  }
  ipc.sendSync('set-global', globalVars);

  el = document.getElementById('write-confirmation-modal-dialog-scan-select');
  allScans = [];
  if (el.value == '1' || el.value == '3') {
    allScans.push(yScan);
  }
  if (el.value == '2' || el.value == '3') {
    allScans.push(zScan);
  }

  var data = {};
  for (scan of allScans) {
    readModifiedWeldingPathData(scan);
    filterPath(scan);
    data[scan.name] = scan.modifiedWeldingPathData;
  }
  ipc.send('write-path', data);
}


function refreshWeldingPathTable(scan) {
  var pathData = scan.modifiedWeldingPathData;
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
  scan.pathTable.replaceData(tableData);
}


function readModifiedWeldingPathData(scan) {
  var data = scan.pathTable.getData()
  scan.modifiedWeldingPathData = [];
  for (item of data) {
    scan.modifiedWeldingPathData.push({
      y: item.y,
      status: (item.valid ? 1 : 0)
    });
  }
}


function onResetModifiedPathData() {
  var activeScan = getActiveScan();
  activeScan.yOffset = 0;
  activeScan.modifiedWeldingPathData = activeScan.originalWeldingPathData;
  new Promise(() => {
    refreshPathChart(activeScan);
    refreshWeldingPathTable(activeScan);
    refreshDotsCountLabels(activeScan);
  });
}


function refreshPathChart(scan, options) {
  var weldingData = scan.modifiedWeldingPathData;
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

  count = scan.originalWeldingPathData.length;
  for(i = 0; i < count; i++) {
    item = scan.originalWeldingPathData[i];
    x = kX*i;
    if(item.status) {
      originalData.push( [x, item.y]);
    }
  }


  scan.pathChart.series[0].data = originalData;
  scan.pathChart.series[1].data = seriesData;
  scan.pathChart.series[2].data = filteredData;

  new Promise(() => {
    var resetAxes = true;
    if ( options && options.resetAxes !== undefined) {
      resetAxes = options.resetAxes;
    }
    scan.pathChart.replot( {resetAxes: resetAxes}  );
  });
}


function filterPath(scan) {
  var weldingData = scan.modifiedWeldingPathData;
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
  var offset = parseFloat(scan.yOffset);
  if ( isNaN(offset) ) {
    offset = 0;
  }
  for (var i = 0; i < n; i++) {
    weldingData[i].filteredY = arrOut[i] + offset;
  }
}


function onResizeWindow() {
  var allScans = [
    yScan,
    zScan
  ];
  for(var scan of allScans) {
    scan.pathChart.replot();
  }
}


function resetZoom() {
  var activeScan = getActiveScan();
  var activateZoom = false;
  if ( !activeScan.pathChart.plugins.cursor._zoom ) {
    activeScan.pathChart.plugins.cursor._zoom = activeScan.pathChart.mx.options.zoomPlugin;
    activateZoom = true;
  }

  activeScan.pathChart.resetZoom();

  if ( activateZoom ) {
    activeScan.pathChart.plugins.cursor._zoom = undefined;
  }

  activeScan.pathChart.replot ( { resetAxes: true} );
}


function onDragStartPathChart(ev, seriesIndex, pointIndex) {
  var activeScan = getActiveScan();
  draggedDotIndex = pointIndex;
  dragStartY = activeScan.pathChart.series[1].data[pointIndex][1];
}


function onDragStopPathChart(dotChartIndex) {
  var activeScan = getActiveScan();
  var dot = activeScan.pathChart.series[1].data[dotChartIndex];
  var draggedX = dot[0];
  var draggedY = dot[1];
  var draggedDeltaY = draggedY - dragStartY;
  var draggedRegion = false;
  var tableData = activeScan.pathTable.getData();
  var kX = 1; // constants.kX
  var dotTableIndex;

  if(activeScan.chartSelection.state == 'rect') {
    draggedRegion = activeScan.chartSelection.x0 <= draggedX &&
                    activeScan.chartSelection.x1 >= draggedX;
  }

  if (draggedRegion) {
    var x = activeScan.chartSelection.x0;
    var x1 = activeScan.chartSelection.x1;
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
    activeScan.pathTable.replaceData(tableData);
    readModifiedWeldingPathData(activeScan);
    filterPath(activeScan);
    refreshWeldingPathTable(activeScan);
    refreshPathChart(activeScan, {
      resetAxes: false,
    });
  });
}


function onOpenDotsCountDialog() {
  var activeScan = getActiveScan();
  var input = document.getElementById('dots-count-modal-input');
  readModifiedWeldingPathData(activeScan);
  input.value = activeScan.modifiedWeldingPathData.length;
  $('#dots-count-modal-dialog').modal('show');
}


function onDotsCountDialogOkClick() {
  var activeScan = getActiveScan();
  var input = document.getElementById('dots-count-modal-input');
  var newSize = parseInt(input.value);
  if ( !isNaN(newSize) && newSize >= 0 ) {
    if ( newSize > constants.dotsCountMax ) {
      newSize = constants.dotsCountMax;
    }
    if ( newSize != activeScan.modifiedWeldingPathData.length ) {
      activeScan.allDotsCountLabel.textContent = newSize;
      new Promise(() => {
        resizeWeldingData(activeScan, newSize);
      });
    }
  }
  $('#dots-count-modal-dialog').modal('hide');
}


function onPathTableDataEdited(data) {
  var activeScan = getActiveScan();
  new Promise(() => {
    readModifiedWeldingPathData(activeScan);
    filterPath(activeScan);
    refreshPathChart(activeScan, { resetAxes: false });
    refreshWeldingPathTable(activeScan);
    refreshDotsCountLabels(activeScan);
  });
}


function resizeWeldingData(scan, newSize) {
  if ( newSize < scan.modifiedWeldingPathData.length ) {
    while ( newSize < scan.modifiedWeldingPathData.length ) {
      scan.modifiedWeldingPathData.pop();
    }
  }
  else {
    while ( scan.modifiedWeldingPathData.length < newSize ) {
      scan.modifiedWeldingPathData.push({
        y: 0.0,
        status: 1
      });
    }
  }

  filterPath(scan);
  refreshWeldingPathTable(scan);
  refreshPathChart(scan);
  refreshDotsCountLabels(scan);
}


function refreshDotsCountLabels(scan) {
  var data = scan.modifiedWeldingPathData;
  scan.allDotsCountLabel.textContent = data.length;

  var goodDots = 0;
  for (var item of data) {
    if ( item.status ) {
      goodDots++;
    }
  }
  scan.goodDotsCountLabel.textContent = goodDots;

  var badDots = data.length - goodDots;
  scan.badDotsCountLabel.textContent = badDots;
}



function onOpenOptionsDialog() {
  var varNames = [
    'controllerIp',
  ];
  var allScans = [
    yScan,
    zScan
  ];
  for (var scan of allScans) {
    var scanName = scan.name + '.';
    varNames.push(
      scanName + 'blockNumber',
      scanName + 'yArrayAddress',
      scanName + 'yStatusArrayAddress',
      scanName + 'numberOfDotsAddress');
  }

  var globalVars = ipc.sendSync('get-global', varNames);

  var ipInput = document.getElementById('ip-input');
  ipInput.value = globalVars.controllerIp;

  var allScans = [
    yScan,
    zScan
  ];
  for (let scan of allScans) {
    let name = scan.name;
    let prefix = name.toLowerCase() + '-';

    var blockNumberInput = document.getElementById(prefix + 'block-number-input');
    blockNumberInput.value = globalVars[name + '.blockNumber'];

    var yArrayAddressInput = document.getElementById(prefix + 'y-array-address-input');
    yArrayAddressInput.value = globalVars[name + '.yArrayAddress'];

    var yStatusArrayAddressInput = document.getElementById(prefix + 'y-status-array-address-input');
    yStatusArrayAddressInput.value = globalVars[name + '.yStatusArrayAddress'];

    var numberOfDotsAddressInput = document.getElementById(prefix + 'number-of-dots-address-input');
    numberOfDotsAddressInput.value = globalVars[name + '.numberOfDotsAddress'];
  }

  $('#options-modal-dialog').modal('show');
}


function onOptionsDialogOkClick() {
  var values = {};

  var ipInput = document.getElementById('ip-input');
  values['controllerIp'] = ipInput.value;

  var allScans = [
    yScan,
    zScan
  ];
  for (let scan of allScans) {
    let name = scan.name;
    let prefix = name.toLowerCase() + '-';

    var blockNumberInput = document.getElementById(prefix + 'block-number-input');
    values[name + '.blockNumber'] = blockNumberInput.value;

    var yArrayAddressInput = document.getElementById(prefix + 'y-array-address-input');
    values[name + '.yArrayAddress'] = yArrayAddressInput.value;

    var yStatusArrayAddressInput = document.getElementById(prefix + 'y-status-array-address-input');
    values[name + '.yStatusArrayAddress'] = yStatusArrayAddressInput.value;

    var numberOfDotsAddressInput = document.getElementById(prefix + 'number-of-dots-address-input');
    values[name + '.numberOfDotsAddress'] = numberOfDotsAddressInput.value;
  }

  ipc.sendSync('set-global', values);

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
  var activeScan = getActiveScan();
  var prefix = activeScan.name.toLowerCase();

  var zoomActivated = document.getElementById(prefix + '-chart-zoom-state').checked;
  var dragActivated = document.getElementById(prefix + '-chart-drag-state').checked;

  activeScan.pathChart.series[1].plugins.draggable = dragActivated
   ? activeScan.pathChart.mx.options.draggablePlugin
   : undefined;
  activeScan.pathChart.plugins.cursor._zoom = zoomActivated
   ? activeScan.pathChart.plugins.cursor._zoom = activeScan.pathChart.mx.options.zoomPlugin
   : undefined;
}


function onOpenYOffsetDialog() {
  var activeScan = getActiveScan();
  var input = document.getElementById('y-offset-modal-input');
  input.value = activeScan.yOffset;
  $('#y-offset-modal-dialog').modal('show');
}


function onYOffsetDialogOkClick() {
  var activeScan = getActiveScan();
  var input = document.getElementById('y-offset-modal-input');
  activeScan.yOffset = input.value;
  $('#y-offset-modal-dialog').modal('hide');
  new Promise(() => {
    readModifiedWeldingPathData(activeScan);
    filterPath(activeScan);
    refreshWeldingPathTable(activeScan);
    refreshPathChart(activeScan, {
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

  let el = document.getElementById('write-confirmation-modal-dialog-scan-select');
  el.addEventListener('change', () => onWriteConfirmationModalDialogScanSelect(el));
}


function onWriteConfirmationModalDialogScanSelect(el) {
  var visible = {};
  switch (el.value) {
    case '1':
      visible['yScan'] = true;
      break;
    case '2':
      visible['zScan'] = true;
      break;
    default:
      visible['yScan'] = true;
      visible['zScan'] = true;
  }

  var elNames = [
    'title',
    'path-select',
    'block-number',
    'number-of-dots-address',
    'y-array-address',
    'y-status-array-address'
  ];

  var allScans = [
    yScan,
    zScan
  ];
  for (var scan of allScans) {
    var scanName = scan.name;
    var hidden = !visible[scanName];
    var prefix = 'write-confirmation-modal-dialog-row-' + scanName.toLowerCase() + '-';
    for (var name of elNames) {
      document.getElementById(prefix + name).hidden = hidden;
    }
  }
}


function onClearSelectionButtonClick() {
  var activeScan = getActiveScan();

  if (!activeScan.chartSelection.state) {
    $('#chart-selection-info-modal-dialog').modal('show');
  }
  else {
    activeScan.chartSelection.state = null;
    let objects = activeScan.pathChart.plugins.canvasOverlay.objects;
    let rect = objects[0];
    let line = objects[1];
    rect.options.xmin = -1001;
    rect.options.xmax = -1000;
    line.options.x = -1000;
    activeScan.pathChart.replot();
  }
}


function onSetStatusClick() {
  var activeScan = getActiveScan();
  refreshAll(activeScan, function() {
    let allRows = activeScan.pathTable.getSelectedRows();
    for(let row of allRows) {
      var index = row.getPosition();
      activeScan.modifiedWeldingPathData[index].status = 1;
    }
  });
}


function onSetStatusForAllClick() {
  var activeScan = getActiveScan();
  refreshAll(activeScan, function() {
    for(let item of activeScan.modifiedWeldingPathData) {
      item.status = 1;
    }
  });
}


function onClearStatusClick() {
  var activeScan = getActiveScan();
  refreshAll(activeScan, function() {
    let allRows = activeScan.pathTable.getSelectedRows();
    for(let row of allRows) {
      var index = row.getPosition();
      activeScan.modifiedWeldingPathData[index].status = 0;
    }
  });
}


function onClearRowsSelectionClick() {
  var activeScan = getActiveScan();
  activeScan.pathTable.deselectRow();
}


function refreshAll(scan, cb) {
  new Promise(() => {
    readModifiedWeldingPathData(scan);
    if (cb) {
      cb();
    }
    filterPath(scan);
    refreshPathChart(scan);
    refreshWeldingPathTable(scan);
    refreshDotsCountLabels(scan);
  });
}


function onSetStatusInRangeClick(status) {
  var activeScan = getActiveScan();

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
  fromInput.value = activeScan.tableSelection.fromIndex;

  var toInput = document.getElementById("set-clear-status-in-range-to-input");
  toInput.value = activeScan.tableSelection.toIndex;

  $('#set-clear-status-in-range-modal-dialog').modal('show');
}


function onClearStatusInRangeClick() {
  onSetStatusInRangeClick(false);
}


function onSetStatusInRangeDialogOkClick(status) {
  $('#set-clear-status-in-range-modal-dialog').modal('hide');

  var activeScan = getActiveScan();

  var fromInput = document.getElementById("set-clear-status-in-range-from-input");
  activeScan.tableSelection.fromIndex = fromInput.value;

  var toInput = document.getElementById("set-clear-status-in-range-to-input");
  activeScan.tableSelection.toIndex = toInput.value;

  var fromIndex = parseInt(activeScan.tableSelection.fromIndex);
  var toIndex = parseInt(activeScan.tableSelection.toIndex);

  if (!isNaN(fromIndex) && !isNaN(toIndex)) {
    if (fromIndex < 0) {
      fromIndex = 0;
    }
    refreshAll(activeScan, function() {
      if (toIndex >= activeScan.modifiedWeldingPathData.length) {
        toIndex = activeScan.modifiedWeldingPathData.length - 1;
      }
      for(let i = fromIndex; i <= toIndex; i++) {
        activeScan.modifiedWeldingPathData[i].status = status;
      }
    });
  }
}


function onChartClick(event, gridPos, dataPos) {
  if(ctrlKey) {
    let activeScan = getActiveScan();

    let objects = activeScan.pathChart.plugins.canvasOverlay.objects;
    let rect = objects[0];
    let line = objects[1];
    let x = dataPos.xaxis;

    switch(activeScan.chartSelection.state) {
      case null:
      case 'rect':
        rect.options.xmin = -1001;
        rect.options.xmax = -1000;
        line.options.x = x;
        activeScan.chartSelection.x0 = x;
        activeScan.chartSelection.x1 = x;
        activeScan.chartSelection.state = 'line';
        break;
      case 'line':
        line.options.x = -1000;
        activeScan.chartSelection['x' + (x < activeScan.chartSelection.x0 ? '0' : '1')] = x;
        rect.options.xmin = activeScan.chartSelection.x0;
        rect.options.xmax = activeScan.chartSelection.x1;
        activeScan.chartSelection.state = 'rect';
    }

    activeScan.pathChart.replot();
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
  var activeScan = getActiveScan();

  var yMoveEl = document.getElementById('chart-selection-y-move-modal-input');
  yMoveEl.value = activeScan.chartSelection.yMove;

  $('#chart-selection-y-move-modal-dialog').modal('show');
}


function onChartSelectionYMoveDialogOkClick() {
  $('#chart-selection-y-move-modal-dialog').modal('hide');

  var activeScan = getActiveScan();

  var yMoveEl = document.getElementById('chart-selection-y-move-modal-input');
  activeScan.chartSelection.yMove = yMoveEl.value;

  var yMove = parseFloat(activeScan.chartSelection.yMove);
  if (isNaN(yMove) ||
      activeScan.chartSelection.state != 'rect') {
    return;
  }

  var x = activeScan.chartSelection.x0;
  var x1 = activeScan.chartSelection.x1;
  var tableData = activeScan.pathTable.getData();
  var kX = 1; // constants.kX
  var dotTableIndex = Math.round(x/kX);
  while(x < x1) {
    var item = activeScan.originalWeldingPathData[dotTableIndex];
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
    activeScan.pathTable.replaceData(tableData);
    readModifiedWeldingPathData(activeScan);
    filterPath(activeScan);
    refreshWeldingPathTable(activeScan);
    refreshPathChart(activeScan, {
      resetAxes: false,
    });
  });
}


function onChartRangeSelectionClick() {
  var activeScan = getActiveScan();

  var fromEl = document.getElementById('chart-range-selection-from-input');
  fromEl.value = activeScan.chartSelection.index0;

  var toEl = document.getElementById('chart-range-selection-to-input');
  toEl.value = activeScan.chartSelection.index1;

  $('#chart-range-selection-modal-dialog').modal('show');
}


function onChartRangeSelectionDialogOkClick() {
  $('#chart-range-selection-modal-dialog').modal('hide');

  var activeScan = getActiveScan();

  var fromEl = document.getElementById('chart-range-selection-from-input');
  activeScan.chartSelection.index0 = fromEl.value;

  var toEl = document.getElementById('chart-range-selection-to-input');
  activeScan.chartSelection.index1 = toEl.value;

  var index0 = parseFloat(activeScan.chartSelection.index0);
  var index1 = parseFloat(activeScan.chartSelection.index1);

  var correctSelection = !isNaN(index0) && !isNaN(index1) && index0 < index1;

  var kX = 1.0;

  var objects = activeScan.pathChart.plugins.canvasOverlay.objects;
  var rect = objects[0];
  var line = objects[1];

  line.options.x = -1000;

  if (correctSelection) {
    activeScan.chartSelection.state = 'rect';
    activeScan.chartSelection.x0 = kX * index0;
    activeScan.chartSelection.x1 = kX * index1;
    rect.options.xmin = activeScan.chartSelection.x0;
    rect.options.xmax = activeScan.chartSelection.x1;
  }
  else {
    activeScan.chartSelection.state = null;
    rect.options.xmin = -1001;
    rect.options.xmax = -1000;
  }

  activeScan.pathChart.replot();
}


function onChangeScanTabs(e) {
  var href = e.target.href;
  var tabId = href.substring(href.indexOf('#') + 1);
  switch(tabId) {
    case 'yscan-tab':
      activeScan = yScan;
      break;
    case 'zscan-tab':
      activeScan = zScan;
      break;
  }

  if (!activeScan.pageCreated) {
    activeScan.createPage();
  }
}


function getActiveScan() {
  return activeScan;
}
