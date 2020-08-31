const electron = require('electron')
const ipc = electron.ipcRenderer
const tabulator = require('tabulator-tables')
const constants = require('./constants.js')
const filters = require('./path_filter.js')

var readButton
var writeButton
var resetModificationButton
var resetZoomButton
var exitButton
var yOffsetButton
var zoomButton
var dragButton
var chartButtonsPanel
var allDotsCountLabel
var badDotsCountLabel
var goodDotsCountLabel
var pathChart
var pathTable
var originalWeldingPathData = []
var modifiedWeldingPathData = []
var dataSpaceSeparator
var tableSpace
var chartSpace
var draggedDotIndex
var yOffset = 0

window.onload = function() {
  ipc.on('set-path-data', (event, arg) => {
    originalWeldingPathData = arg;
    filterPath(arg);
    refreshWeldingPathTable(arg);
    refreshPathChart(arg);
    refreshDotsCountLabels(arg);
  });

  ipc.on('get-path-data', () => {
    readModifiedWeldingPathData();
    ipc.send('get-path-data-reply', modifiedWeldingPathData);
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

  resetModificationButton = document.getElementById('reset-modification-button');
  resetModificationButton.addEventListener('click', () => {
    openConfirmationDialog(
      'Все изменения будут потеряны. Продолжить?',
      resetModifiedPathData
    );
  });

  resetZoomButton = document.getElementById('reset-zoom-button');
  resetZoomButton.addEventListener('click', resetZoom);

  exitButton = document.getElementById('exit-button');
  exitButton.addEventListener('click', () => window.close());

  zoomButton = document.getElementById('zoom-button');
  zoomButton.addEventListener('click', onChartButtonClick);

  dragButton = document.getElementById('drag-button');
  dragButton.addEventListener('click', onChartButtonClick);

  chartButtonsPanel = document.getElementById('chart-buttons-panel');

  allDotsCountLabel = document.getElementById('all-dots-count-label');
  badDotsCountLabel = document.getElementById('bad-dots-count-label');
  goodDotsCountLabel = document.getElementById('good-dots-count-label');

  dataSpaceSeparator = document.getElementById('data-space-separator');

  tableSpace = document.getElementById('table-space');

  chartSpace = document.getElementById('chart-space');

  $.jqplot.config.enablePlugins = true;
  pathChart = $.jqplot('path-chart',  [ [,], [,] ],
    {
      seriesDefaults: {
        shadow: false,
        lineWidth: 1,
      },
      series: [
        {
          color: '#ffffff',
          label: 'Исходная',
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
      grid: {
        shadow: false
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
              numberColumns: 2,
              seriesToggleReplot: true,
          }
      }
    }
  );
  pathChart.series[0].plugins.draggable.constrainTo = 'y';
  pathChart.series[1].plugins.draggable = undefined;

  $('#path-chart').bind('jqplotDragStart', (ev, seriesIndex, pointIndex) => { draggedDotIndex = pointIndex; });
  $('#path-chart').bind('jqplotDragStop', () => { onDragStopPathChart(draggedDotIndex); });

  pathChart.mx = {
    options: {
      draggablePlugin: pathChart.series[0].plugins.draggable,
      zoomPlugin:      pathChart.plugins.cursor._zoom,
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

  pathTable = new tabulator("#path-table", {
    autoResize: false,
    height: "400px",
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

  window.addEventListener('resize', event => onResizeWindow(event));
  onResizeWindow()
}


function readPathFromSimatic() {
  ipc.on('read-path-reply', (event, arg) => {
    originalWeldingPathData = arg;
    filterPath(originalWeldingPathData);
    refreshWeldingPathTable(originalWeldingPathData);
    refreshPathChart(originalWeldingPathData);
    refreshDotsCountLabels(originalWeldingPathData);
  });

  ipc.send('read-path', "");
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
  filterPath(modifiedWeldingPathData);
  ipc.send('write-path', modifiedWeldingPathData);
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
  pathTable.replaceData(tableData);
}


function readModifiedWeldingPathData() {
  var data = pathTable.getData()
  modifiedWeldingPathData = [];
  for (item of data) {
    modifiedWeldingPathData.push({
      y: item.y,
      status: (item.valid ? 1 : 0)
    });
  }
}


function resetModifiedPathData() {
  yOffset = 0;
  var newModified = [];
  for (var item of originalWeldingPathData) {
    newModified.push( [].concat(item) );
  }
  modifiedWeldingPathData = originalWeldingPathData;
  new Promise(() => {
    refreshPathChart(originalWeldingPathData);
    refreshWeldingPathTable(originalWeldingPathData);
    refreshDotsCountLabels(originalWeldingPathData);
  });
}


function refreshPathChart(weldingData, options) {
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
      filteredData. push( [x, item.filteredY] );
    }
  }
  pathChart.series[0].data = seriesData;
  pathChart.series[1].data = filteredData;

  new Promise(() => {
    var resetAxes = true;
    if ( options && options.resetAxes !== undefined) {
      resetAxes = options.resetAxes;
    }
    pathChart.replot( {resetAxes: resetAxes}  );
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
  var offset = parseFloat(yOffset);
  if ( isNaN(offset) ) {
    offset = 0;
  }
  for (var i = 0; i < n; i++) {
    weldingData[i].filteredY = arrOut[i] + offset;
  }
}

function onResizeWindow() {
  var gap = chartSpace.getBoundingClientRect().left;

  var pathTableOffsets = pathTable.element.getBoundingClientRect();
  var pathTableW = pathTableOffsets.right - pathTableOffsets.left;

  var tableLeft = window.innerWidth - pathTableW - gap;
  var top = dataSpaceSeparator.getBoundingClientRect().bottom;
  tableSpace.style.left = tableLeft + 'px';
  tableSpace.style.top  = top + 'px';
  tableSpace.style.width = pathTableW + 'px';
  var dataSpaceHeight = window.innerHeight - top - gap;
  if ( dataSpaceHeight < 0 ) {
    dataSpaceHeight = 0;
  }
  tableSpace.style.height = dataSpaceHeight + 'px';

  var dotsCountTableContainer = document.getElementById('dots-count-table-container');
  var dotsCountTableContainerOffsets = dotsCountTableContainer.getBoundingClientRect();

  var pathTableTop = dotsCountTableContainerOffsets.bottom - dotsCountTableContainerOffsets.top + gap;
    pathTable.element.style.top = pathTableTop + 'px';

  pathTableOffsets = pathTable.element.getBoundingClientRect();
  var pathTableHeight = dataSpaceHeight - pathTableTop;
  if ( pathTableHeight < 0 ) {
    pathTableHeight = 0;
  }
  pathTable.element.style.height = pathTableHeight + 'px';

  dotsCountTableContainer.style.width = (pathTableOffsets.right - pathTableOffsets.left) + 'px';

  chartSpace.style.height = dataSpaceHeight + 'px';
  var chartSpaceW = tableLeft - 2*gap;
  if ( chartSpaceW < 0 ) {
    chartSpaceW = 0;
  }
  chartSpace.style.width = chartSpaceW + 'px';

  var chartW = chartSpaceW - 2;
  if (chartW < 0) {
    chartW = 0;
  }
  var chartH = dataSpaceHeight;
  if ( chartH < 0 ) {
      chartH = 0;
  }


  $('#path-chart').width(chartW);
  $('#path-chart').height(chartH);
  pathChart.replot();

 var chartButtonsPanelRect = chartButtonsPanel.getBoundingClientRect();
 var chartButtonsPanelLeft =
   chartW - (chartButtonsPanelRect.right - chartButtonsPanelRect.left) - 40;
 chartButtonsPanel.style.left = chartButtonsPanelLeft + 'px';

  pathTable.redraw(true);
}


function resetZoom() {
  var activateZoom = false;
  if ( !pathChart.plugins.cursor._zoom ) {
    pathChart.plugins.cursor._zoom = pathChart.mx.options.zoomPlugin;
    activateZoom = true;
  }

  pathChart.resetZoom();

  if ( activateZoom ) {
    pathChart.plugins.cursor._zoom = undefined;
  }

  pathChart.replot ( { resetAxes: true} );
}


function onDragStopPathChart(dotChartIndex) {
  var dot = pathChart.series[0].data[dotChartIndex];
  var kX = 1; // constants.kX
  var dotTableIndex = Math.round(dot[0]/kX);
  var tableData = pathTable.getData();
  tableData[dotTableIndex].y = dot[1];
  new Promise(() => {
    pathTable.replaceData(tableData);
    readModifiedWeldingPathData();
    filterPath(modifiedWeldingPathData);
    refreshWeldingPathTable(modifiedWeldingPathData);
    refreshPathChart(modifiedWeldingPathData, {
      resetAxes: false,
    });
  });
}


function onOpenDotsCountDialog() {
  var input = document.getElementById('dots-count-modal-input');
  readModifiedWeldingPathData();
  input.value = modifiedWeldingPathData.length;
  $('#dots-count-modal-dialog').modal('show');
}


function onDotsCountDialogOkClick() {
  var input = document.getElementById('dots-count-modal-input');
  var newSize = parseInt(input.value);
  if ( !isNaN(newSize) && newSize >= 0 ) {
    if ( newSize > constants.dotsCountMax ) {
      newSize = constants.dotsCountMax;
    }
    if ( newSize != modifiedWeldingPathData.length ) {
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
    filterPath(modifiedWeldingPathData);
    refreshPathChart(modifiedWeldingPathData, { resetAxes: false });
    refreshWeldingPathTable(modifiedWeldingPathData);
    refreshDotsCountLabels(modifiedWeldingPathData);
  });
}


function resizeWeldingData(newSize) {
  if ( newSize < modifiedWeldingPathData.length ) {
    while ( newSize < modifiedWeldingPathData.length ) {
      modifiedWeldingPathData.pop();
    }
  }
  else {
    while ( modifiedWeldingPathData.length < newSize ) {
      modifiedWeldingPathData.push({
        y: 0.0,
        status: 1
      });
    }
  }

  filterPath(modifiedWeldingPathData);
  refreshWeldingPathTable(modifiedWeldingPathData);
  refreshPathChart(modifiedWeldingPathData);
  refreshDotsCountLabels(modifiedWeldingPathData);
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

  pathChart.series[0].plugins.draggable = dragActivated
   ? pathChart.mx.options.draggablePlugin
   : undefined;
  pathChart.plugins.cursor._zoom = zoomActivated
   ? pathChart.plugins.cursor._zoom = pathChart.mx.options.zoomPlugin
   : undefined;
}


function onOpenYOffsetDialog() {
  var input = document.getElementById('y-offset-modal-input');
  input.value = yOffset;
  $('#y-offset-modal-dialog').modal('show');
}


function onYOffserDialogOkClick() {
  var input = document.getElementById('y-offset-modal-input');
  yOffset = input.value;
  $('#y-offset-modal-dialog').modal('hide');
  new Promise(() => {
    readModifiedWeldingPathData();
    filterPath(modifiedWeldingPathData);
    refreshWeldingPathTable(modifiedWeldingPathData);
    refreshPathChart(modifiedWeldingPathData, {
      resetAxes: false,
    });
  });
}
