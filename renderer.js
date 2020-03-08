const electron = require('electron')
const ipc = electron.ipcRenderer
const tabulator = require('tabulator-tables')
const constants = require('./constants.js')


var readButton
var writeButton
var resetModificationButton
var resetZoomButton
var exitButton
var allDotsCountLabel
var badDotsCountLabel
var goodDotsCountLabel
var pathChart
var pathChartController
var pathTable
var originalWeldingPathData = []
var modifiedWeldingPathData = []
var dataSpaceSeparator
var tableSpace
var chartSpace
var draggedDotIndex


window.onload = function() {
  ipc.on('set-path-data', (event, arg) => {
    originalWeldingPathData = arg;
    refreshWeldingPathTable(originalWeldingPathData);
    refreshPathChart(originalWeldingPathData);
    refreshDotsCountLabels(originalWeldingPathData);
  });

  ipc.on('get-path-data', () => {
    readModifiedWeldingPathData();
    ipc.send('get-path-data-reply', modifiedWeldingPathData);
  });
  ipc.on('open-options-dialog', () => onOpenOptionsDialog());
  ipc.on('open-error-dialog', (event, arg) => onOpenErrorDialog(arg));
  ipc.on('open-write-success-dialog', () => onOpenWriteSuccessDialog());

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
  exitButton.addEventListener('click', () => { window.close(); });

  allDotsCountLabel = document.getElementById('all-dots-count-label');
  allDotsCountLabel.textContent = '0';

  badDotsCountLabel = document.getElementById('bad-dots-count-label');
  badDotsCountLabel.textContent = '0';

  goodDotsCountLabel = document.getElementById('good-dots-count-label');
  goodDotsCountLabel.textContent = '0';

  dataSpaceSeparator = document.getElementById('data-space-separator');

  tableSpace = document.getElementById('table-space');

  chartSpace = document.getElementById('chart-space');

  pathChartController = $.jqplot('path-chart-controller', [[,]],
    {
      seriesColors: [
        '#dd0000'
      ],
      seriesDefaults: {
        showMarker: true,
        shadow: false,
        lineWidth: 2.5,
        markerOptions: {
          show: false
        },
        fill: true,
        fillAndStroke: true
      },
      cursor: {
        show: true,
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
        shadow: false,
        background: '#bbeebb',
        borderWidth: 0,
        gridLineColor: '#77bb77'
      },
      gridPadding: {
        top:     8,
        bottom: 24,
        left:   80,
        right:  20
      }
    }
  );

  $.jqplot.config.enablePlugins = true;
  pathChart = $.jqplot('path-chart',  [[,]],
    {
      seriesColors: [
        '#ffffff'
      ],
      seriesDefaults: {
        showMarker: true,
        shadow: false,
        lineWidth: 1,
        markerOptions: {
          shadow: false,
          size: 7,
          color: '#ffaa88'
        },
      },
      cursor: {
        show: true,
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
        top:     8,
        bottom: 24,
        left:   80,
        right:  20
      }
    }
  );
  pathChart.series[0].plugins.draggable.constrainTo = 'y';

  $.jqplot.Cursor.zoomProxy(pathChart, pathChartController);
  $('#path-chart').bind('jqplotDragStart', (ev, seriesIndex, pointIndex) => { draggedDotIndex = pointIndex; });
  $('#path-chart').bind('jqplotDragStop', () => { onDragStopPathChart(draggedDotIndex); });

  pathTable = new tabulator("#path-table", {
    autoResize: false,
    height: "400px",
    columns:[
      {
        title: "ИНДЕКС",
        field: "index",
        align: "right",
        width: 72,
        headerSort: false
      },

      {
        title: "X,мм",
        field: "x",
        align: "right",
        width: 68,
        headerSort: false
      },

      {
        title: "Y,мм",
        field: "y",
        align: "right",
        width: 68,
        formatter: function(cell, formatterParams, onRendered) {
          return parseFloat(cell.getValue()).toFixed(3);
        },
        editor: "input",
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
  readModifiedWeldingPathData();
  ipc.send('write-path', modifiedWeldingPathData);
}


function refreshWeldingPathTable(pathData) {
  var index = 0;
  var tableData = [];
  for (item of pathData) {
    var x = index * 5;
    tableData.push(
      {index:index, x:x, y:item[0], valid:item[1] != 0}
    );
    index++;
  }
  pathTable.replaceData(tableData);
}


function readModifiedWeldingPathData() {
  var data = pathTable.getData()
  modifiedWeldingPathData = [];
  for (item of data) {
    modifiedWeldingPathData.push([
      item.y,
      item.valid ? 1 : 0
    ]);
  }
}


function resetModifiedPathData() {
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


function refreshPathChart(weldingData) {
  var seriesData = [];
  var count = weldingData.length;
  var kX = constants.kX;

  for (var i = 0; i < count; i++) {
    var item = weldingData[i];
    var status = item[1];
    if ( status ) {
      seriesData.push([kX*i, item[0]]);
    }
  }
  pathChart.series[0].data = seriesData;
  pathChartController.series[0].data = seriesData;

  new Promise(() => {
    pathChart.replot( {resetAxes: true}  );
  });
  new Promise(() => {
    pathChartController.replot( {resetAxes: true} );
  });
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

  var chartControllerOffsets = document.getElementById('path-chart-controller').getBoundingClientRect();
  var chartW = chartSpaceW - 2;
  if (chartW < 0) {
    chartW = 0;
  }
  var chartH = dataSpaceHeight - (chartControllerOffsets.bottom - chartControllerOffsets.top) - gap;
  if ( chartH < 0 ) {
      chartH = 0;
  }

  var chartControllerTop = chartH + gap;

  $('#path-chart-controller').width(chartW);
  $('#path-chart-controller').css({top:chartControllerTop + 'px'});
  $('#path-chart').width(chartW);
  $('#path-chart').height(chartH);
  pathChartController.replot();
  pathChart.replot();

  pathTable.redraw(true);
}


function resetZoom() {
  pathChartController.resetZoom();
}


function onDragStopPathChart(dotChartIndex) {
  var dot = pathChart.series[0].data[dotChartIndex];
  pathChartController.series[0].data[dotChartIndex][1] = dot[1];
  new Promise(() => {
    pathChartController.replot();
  });
  var dotTableIndex = Math.round(dot[0]/constants.kX);
  var tableData = pathTable.getData();
  tableData[dotTableIndex].y = dot[1];
  new Promise(() => {
    pathTable.replaceData(tableData);
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
  readModifiedWeldingPathData();
  refreshPathChart(modifiedWeldingPathData);
  refreshDotsCountLabels(modifiedWeldingPathData);
}


function resizeWeldingData(newSize) {
  if ( newSize < modifiedWeldingPathData.length ) {
    while ( newSize < modifiedWeldingPathData.length ) {
      modifiedWeldingPathData.pop();
    }
  }
  else {
    while ( modifiedWeldingPathData.length < newSize ) {
      modifiedWeldingPathData.push([0.0, 1]);
    }
  }

  refreshWeldingPathTable(modifiedWeldingPathData);
  refreshPathChart(modifiedWeldingPathData);
  refreshDotsCountLabels(modifiedWeldingPathData);
}


function refreshDotsCountLabels(data) {
  allDotsCountLabel.textContent = data.length;

  var goodDots = 0;
  for (var item of data) {
    if ( item[1] ) {
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
