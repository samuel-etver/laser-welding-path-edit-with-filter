const electron = require('electron');
const ipc = electron.ipcRenderer;

window.onload = function() {
  var closeButton = document.getElementById('close-button');
  closeButton.addEventListener('click', onCloseClick);

  window.addEventListener('keydown', event => {
    switch( event.key ) {
      case 'Escape':
      case 'Enter':
        onCloseClick();
        break;
    }
  });
}


function onCloseClick() {
  ipc.send('close-about-dialog');
}
