const electron = require('electron');
const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const Menu = electron.Menu;
const ipc = electron.ipcMain;
const dialog = electron.dialog;
const fs = require('fs');
const os = require('os');
const path = require('path');
const csvWriter = require('csv-writer');
const csvParser = require('csv-parser');
const xmldom = require('xmldom');
const nodes7 = require('nodes7');
const config = require('./config.js');
const constants = require('./constants.js');

var mainWindow;
var aboutDialog;

const configFileName = constants.appName + '.config';

var globalVars = {
  controllerIp: '',
  yScan: {
    blockNumber: '',
    yArrayAddress: '',
    yStatusArrayAddress: '',
    numberOfDotsAddress: '',
  },
  blockNumber: '',
  yArrayAddress: '',
  yStatusArrayAddress: '',
  numberOfDotsAddress: '',
  userPath: '',
  homeDir: path.join(process.env.APPDATA, constants.appName),
  writePathType: '',
  debug: false,
};
const configVars = [
  'controllerIp',
  'yScan.blockNumber',
  'yScan.yArrayAddress',
  'yScan.yStatusArrayAddress',
  'yScan.numberOfDotsAddress',
  'blockNumber',
  'yArrayAddress',
  'yStatusArrayAddress',
  'numberOfDotsAddress',
  'userPath',
];
const deprecatedConfigVars = [
  'blockNumber',
  'yArrayAddress',
  'yStatusArrayAddress',
  'numberOfDotsAddress',
];
var yScan = {
  weldingPathData: []
};

var simaticConn;
var simaticVars = {
};

loadConfig();


function createWindow () {
  mainWindow = new BrowserWindow({
    show: false,
    width: 920,
    height: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: true
    }
  });

  mainWindow.loadFile('index.html')

  // Open the DevTools.
  //mainWindow.webContents.openDevTools();

  mainWindow.on('closed', function () {
    mainWindow = null;
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  const template = [
    {
       label: '&Файл',
       submenu: [
        {
          label: 'Загрузить...',
          click: onLoadClick
        },
        {
          label: 'Сохранить...',
          click: onSaveClick
        },
        {
          type: 'separator'
        },
        {
          label: 'Выход',
          click: onExitClick
        }
       ]
    },

    {
      label: '&Опции',
      submenu: [
        {
          label: 'Настройки...',
          click: openOptionsDialog
        },
      ]
    },

    {
      label: '&Справка',
      submenu: [
        {
          label: 'О программе...',
          click: onAboutClick
        },
      ]
    }
  ];

  let menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  ipc.on('read-path', (event, arg) => {
     readPathFromSimatic(event.sender)
  });
  ipc.on('write-path', (event, arg) => {
     writePathToSimatic(event.sender, arg)
  });
  ipc.on('get-global', (event, arg) => {
     onGetGlobal(event, arg);
  });
  ipc.on('set-global', (event, arg) => {
     onSetGlobal(event, arg);
  });
  ipc.on('open-options-dialog', openOptionsDialog);
  ipc.on('close-about-dialog', closeAboutDialog);
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit()
});

app.on('activate', function () {
    if (mainWindow === null) createWindow()
});


function checkSimaticAddresses() {
  var showError = txt => {
      mainWindow.send('open-error-dialog', txt);
  };
  var checkNumber = txt => {
      var number = parseInt(txt);
      return !(isNaN(number) || number < 0);
  }
  var selectText = txt => {
      return '<span style="background:pink">"' + txt + '"</span>';
  }
  
  if ( !checkNumber(getGlobalVar('yScan.blockNumber'))) {
      showError('Ошибка в номере блока: ' + selectText(getGlobalVar('yScan.blockNumber')) + '.');
  }
  else if ( !checkNumber(getGlobalVar('yScan.numberOfDotsAddress')) ) {
      showError('Ошибка в адресе<br><b>"Количество точек"</b>: ' + selectText(getGlobalVar('yScan.numberOfDotsAddress')) + '.');
  }
  else if ( !checkNumber(getGlobalVar('yScan.yArrayAddress')) ) {
      showError('Ошибка в адресе массива<br><b>"Точки"</b>: ' + selectText(getGlobalVar('yScan.yArrayAddress')) + '.');
  }
  else if ( !checkNumber(getGlobalVar('yScan.yStatusArrayAddress')) ) {
      showError('Ошибка в адресе массива<br><b>"Статусы точек"</b>: ' + selectText(getGlobalVar('yScan.yStatusArrayAddress')) + '.');
  }
  else {
      return true;
  }

  return false;
}


function buildSimaticVars() {
  var block = 'DB' + parseInt(getGlobalVar('yScan.blockNumber')) + ',';
  simaticVars.count =
    block + 'INT' + parseInt(getGlobalVar('yScan.numberOfDotsAddress'));
  var n = constants.dotsCountMax;
  var i = 0;
  while ( n ) {
    var packetSize = constants.packetSize;
    if (packetSize > n) {
      packetSize = n;
    }
    simaticVars['yArr' + i] =
      block + 'REAL' + (parseInt(getGlobalVar('yScan.yArrayAddress')) + i*4*constants.packetSize) + '.' + packetSize;
    i++;
    n -= packetSize;
  }
  simaticVars.yStatusArr =
    block + 'BYTE' + parseInt(getGlobalVar('yScan.yStatusArrayAddress')) + '.' + (constants.dotsCountMax / 8);
}


function communicateWithSimatic(communicate, failed) {
  function connect() {
    simaticConn = new nodes7();
    simaticConn.initiateConnection(
      {
        port: 102,
        host: getGlobalVar('controllerIp'),
        rack: 0,
        slot: 2
      },
      connected
    );
  }

  function connected(err) {
    if ( err ) {
      mainWindow.send('open-error-dialog',
        'Не удалось установить соединение с контроллером.');
      return;
    }

    simaticConn.setTranslationCB(tag => { return simaticVars[tag]; });

    for (tag in simaticVars) {
      simaticConn.addItems(tag);
    }

    communicate();
  }

  if ( simaticConn ) {
    simaticConn.dropConnection( () => {
      simaticConn = null;
      connect();
    });
  }
  else {
    connect();
  }
}


function readPathFromSimatic(sender) {
  var valuesReady = function(err, values) {
    if ( err ) {
      mainWindow.send('open-error-dialog', "Не удалось считать с контроллера.");
      return;
    }

    var count = values.count;
    var i;
    var yArr = [];
    var y;
    for (i = 0; ; i++) {
      var arr = values['yArr' + i];
      if ( !arr ) {
        break;
      }
      for (y of arr) {
        yArr.push(y);
      }
    }

    var yStatusArr = values.yStatusArr;
    var data = [];
    var bitsIndex = 0;
    var statusIndex = 0;
    var status;
    var statusBits;

    for (i = 0; i < count; i++) {
      y = yArr[i];
      statusBits = yStatusArr[statusIndex];
      status = 0;
      if ( statusBits & (1 << (bitsIndex)) ) {
        status = 1;
      }
      data.push({
        y: y,
        status: status
      });
      bitsIndex++;
      if ( bitsIndex == 8 ) {
        bitsIndex = 0;
        statusIndex++;
      }
    }

    yScan.weldingPathData = data;
    sender.send('read-path-reply', data);
  }

  if ( !checkSimaticAddresses() ) {
      return;
  }
  buildSimaticVars();
  communicateWithSimatic(() => {
    simaticConn.readAllItems(valuesReady);
  });
}


function writePathToSimatic(sender, data) {
  yScan.weldingPathData = data;

  if ( !checkSimaticAddresses() ) {
      return;
  }
  buildSimaticVars();

  // build data
  var yArr = [];
  var yStatusArr = [];
  var yStatus = 0;
  var yStatusBitIndex = 0;
  var item;
  var n = constants.dotsCountMax;
  var i;

  var getY = getGlobalVar('writePathType') == 'after'
    ? item => item.filteredY
    : item => item.y;
  var getStatus = getGlobalVar('writePathType') == 'after'
    ? item => true
    : item => item.status;

  for (item of yScan.weldingPathData) {
    yArr.push( getY(item) );
  }
  for (i = yArr.length; i < n; i++) {
    yArr.push( 0 );
  }

  for (item of yScan.weldingPathData) {
    yStatus >>= 1;
    if ( getStatus(item) ) {
        yStatus |= 0x80;
    }
    yStatusBitIndex++;
    if (yStatusBitIndex == 8) {
      yStatusBitIndex = 0;
      yStatusArr.push ( yStatus );
      yStatus = 0;
    }
  }

  if ( yStatusBitIndex ) {
    yStatusArr.push( yStatus );
  }
  for (i = yStatusArr.length; i < n / 8; i++) {
      yStatusArr.push( 0 );
  }

  var itemsNames = [
    'count',
    'yStatusArr',
  ];
  var itemsData  = [
    yScan.weldingPathData.length,
    yStatusArr,
  ];

  var n = yArr.length;
  var packetIndex = 0;
  var index = 0;
  while ( n ) {
    var packetSize = constants.packetSize;
    if ( packetSize > n ) {
      packetSize = n;
    }

    var name = 'yArr' + packetIndex;
    var data = [];
    for (i = 0; i < packetSize; i++) {
      data.push( yArr[index] );
      index++;
    }

    itemsNames.push( name );
    itemsData.push( data );

    packetIndex++;
    n -= packetSize;
  }

  var written = function(err) {
    if ( err ) {
      mainWindow.send('open-error-dialog', "Не удалось записать в контроллер.");
    }
    else {
      mainWindow.send('open-write-success-dialog');
    }
    simaticConn.dropConnection(() => {
      simaticConn = null;
    });
  }

  var write = function() {
    simaticConn.writeItems(
      itemsNames,
      itemsData,
      written
    );
  }

  communicateWithSimatic(write);
}


function openOptionsDialog() {
  mainWindow.send('open-options-dialog');
}


function loadConfig() {
  let configFilePath = path.join(getGlobalVar('homeDir'), configFileName);
  let cfg = new config();
  cfg.load(configFilePath);
  for (key of configVars) {
    setGlobalVar(key, cfg.get(key)||'');
  }

  for (key of deprecatedConfigVars) {
    setGlobalVar('yScan.' + key, getGlobalVar(key));
  }
}


function saveConfig() {
  for (key of deprecatedConfigVars) {
    setGlobalVar(key, getGlobalVar('yScan.' + key));
  }

  let configFolder = getGlobalVar('homeDir');
  if ( !fs.existsSync(configFolder) ) {
    fs.mkdirSync(configFolder, {recursive: true});
  }
  let configFilePath = path.join(configFolder, configFileName);

  let cfg = new config();
  for (key of configVars) {
    cfg.set(key, getGlobalVar(key));
  }
  cfg.save(path.join(configFolder, configFileName));
}


function onGetGlobal(event, args) {
  var data = {};
  for (item of args) {
    data[item] = getGlobalVar(item);
  }
  event.returnValue = data;
}


function onSetGlobal(event, args) {
  for (item in args) {
    setGlobalVar(item, args[item]);
  }
  event.returnValue = true;
  saveConfig();
}


function onExitClick() {
  mainWindow.close();
}


function onLoadClick() {
  var defaultPath = getGlobalVar('userPath');

  dialog.showOpenDialog(
    {
      title: 'Открыть файл',
      defaultPath: defaultPath,
      filters: [
        {
          name: "XML файлы (*.xml)",
          extensions: ["xml"]
        },
        {
          name: "CSV файлы (*.csv)",
          extensions: ["csv"]
        },
        {
          name: "Все файлы (*.*)",
          extensions: ["*"]
        },
      ],
      properties: ['openFile', 'createDirectory']
    }
  ).then(result => {
    var filename = result.filePaths[0];
    setGlobalVar('userPath', path.dirname(filename));
    saveConfig();
    loadFile(filename).then(
      () => {
        mainWindow.send('set-path-data', yScan.weldingPathData);
      },
      () => {
        mainWindow.send(
          'open-error-dialog',
          'Не удалось загрузить данные из файла \n(' + filename + ')'
        );
      }
    );
  });
}


function loadFile(filename) {
  var ext = path.extname(filename).toLowerCase();
  switch(ext) {
    case '.xml':
      return loadFromXmlFile(filename);
    case '.csv':
      return loadFromCsvFile(filename);
  }

  return new Promise((resolve, reject) => {
    reject();
  });
}


function loadFromXmlFile(filename) {
  var error = true;
  var newWeldingPathData = [];
  var promise = new Promise((resolve, reject) => {
    try {
      var txt = fs.readFileSync(filename, 'utf8');
      var parser = new xmldom.DOMParser();
      var doc = parser.parseFromString(txt);
      parsing: {
        var rootEl = doc.documentElement;
        if ( rootEl.nodeName != 'laser_welding_path_editor' ) {
          break parsing;
        }

        for (var i = 0; i < rootEl.childNodes.length; i++) {
          var el = rootEl.childNodes[i];
          if (el.nodeName == 'path') {
            var pathEl = el;
            break;
          }
        }
        if ( !pathEl ) {
          break parsing;
        }

        var pathNodes = pathEl.childNodes;
        for (var i = 0; i < pathNodes.length; i++) {
          var el = pathNodes[i];
          if (el.nodeName != 'item') {
            continue;
          }
          var itemNodes = el.childNodes;
          var textNode
          var y = null;
          var status = null;
          for (var j = 0; j < itemNodes.length; j++) {
            el = itemNodes[j];
            textNode = el.childNodes[0];
            if ( textNode ) {
              switch (el.nodeName) {
                case 'y':
                  y = parseFloat(textNode.nodeValue);
                  break;
                case 'status':
                  status = parseInt(textNode.nodeValue);
                  if ( status ) {
                    status = 1;
                  }
                  break;
              }
            }
          }
          if ( y != null && status != null ) {
            newWeldingPathData.push({
              y: y,
              status: status
            });
          }
        }

        yScan.weldingPathData = newWeldingPathData
        error = false;
      }
    }
    catch(e) {
    }

    error ?  reject() : resolve();
  });
  return promise;
}


function loadFromCsvFile(filename) {
  var error = false;
  var newWeldingPathData = [];

  var promise = new Promise((resolve, reject) => {
    fs.createReadStream(filename)
      .pipe(csvParser({
        separator: ';'
      }))
      .on('data', data => {
      if (!error && data.Y && data.STATUS) {
        var y = parseFloat(data.Y);
        var status = parseInt(data.STATUS);
        if ( !isNaN(y) && !isNaN(status) ) {
          if (status != 0) {
            status = 1;
          }
          newWeldingPathData.push({
            y: y,
            status: status
          });
        }
        else {
          error = true;
        }
      }
      else {
        error = true;
      }
    })
    .on('end', () => {
      if ( error ) {
        reject();
      }
      else {
        yScan.weldingPathData = newWeldingPathData;
        resolve();
      }
    });
  });

  return promise;
}


function onSaveClick() {
  ipc.on('get-path-data-reply', (event, arg) => onGetPathData(arg) );
  yScan.weldingPathData = mainWindow.send('get-path-data');

  function onGetPathData(data) {
    ipc.removeAllListeners('get-path-data-reply');

    yScan.weldingPathData = data;
    var defaultPath = getGlobalVar('userPath');

    dialog.showSaveDialog(
      {
        title: 'Сохранить в файле',
        defaultPath: defaultPath,
        filters: [
          {
            name: "XML файлы (*.xml)",
            extensions: ["xml"]
          },
          {
            name: "CSV файлы (*.csv)",
            extensions: ["csv"]
          },
          {
            name: "Все файлы (*.*)",
            extensions: ["*"]
          },
        ],
      }
    ).then(result => {
      var filename = result.filePath;
      var ext = path.extname(filename).toLowerCase();
      if ( !['.xml', '.csv'].includes(ext) ) {
        ext = '.xml';
        filename += ext;
      }

      setGlobalVar('debug', ext);
      setGlobalVar('userPath', path.dirname(filename));
      saveConfig();
      saveFile(filename);
    });
  }
}


function saveFile(filename) {
  var ext = path.extname(filename).toLowerCase();
  var failed = function() {
    mainWindow.send(
      'open-error-dialog',
      'Не удалось данные сохранить в файле \n(' + filename + ')'
    );
  }

  switch(ext) {
    case '.xml':
      saveToXmlFile(filename).catch(failed);
      break;
    case '.csv':
      saveToCsvFile(filename).catch(failed);
      break;
  }
}


function saveToXmlFile(filename) {
  var doc = new xmldom.DOMParser().parseFromString(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<laser_welding_path_editor/>');
  var rootEl = doc.documentElement;
  var pathEl = doc.createElement('path');
  rootEl.appendChild(pathEl);
  for (var item of yScan.weldingPathData) {
    var itemEl = doc.createElement('item');
    pathEl.appendChild(itemEl);
    var yEl = doc.createElement('y');
    yEl.appendChild(doc.createTextNode(item.y.toString()));
    itemEl.appendChild(yEl);
    var statusEl = doc.createElement('status');
    statusEl.appendChild(doc.createTextNode(item.status.toString()));
    itemEl.appendChild(statusEl);
  }
  var serializer = new xmldom.XMLSerializer();
  var txt = serializer.serializeToString(doc);
  return new Promise((resolve, reject) => {
    try {
      fs.writeFileSync(filename, txt, 'utf8');
      resolve();
    }
    catch(e) {
      reject(e);
    }
  });
}


function saveToCsvFile(filename) {
  const writer = csvWriter.createArrayCsvWriter({
    path: filename,
    header: ['Y','STATUS'],
    fieldDelimiter: ';',
    recordDelimiter: '\r\n'
  });
  var data = [];
  for (var item of yScan.weldingPathData) {
    data.push([
      item.y,
      item.status
    ]);
  }
  return writer.writeRecords(data);
}


function onAboutClick() {
  aboutDialog = new electron.BrowserWindow({
    parent: mainWindow,
    width: 412,
    height: 564,
    center: true,
    modal: true,
    show: false,
    resizable: false,
    minimizable: false,
    webPreferences: {
      nodeIntegration: true
    }
  });
  aboutDialog.removeMenu();
  aboutDialog.loadFile('about.html');
  aboutDialog.on('ready-to-show', () => aboutDialog.show());
}


function closeAboutDialog() {
  aboutDialog.close();
  aboutDialog = null;
}


function getGlobalVar(name) {
  var subNames = name.split('.');
  var result = globalVars;
  for (var n = 0; n < subNames.length; n++) {
    result = result[subNames[n]];
  }
  return result;
}


function setGlobalVar(name, value) {
  var subNames = name.split('.');
  var result = globalVars;
  for (var n = 0; n < subNames.length - 1; n++) {
    result = result[subNames[n]];
  }
  result[subNames[n]] = value;
}
