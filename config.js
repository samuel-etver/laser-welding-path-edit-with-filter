const fs = require('fs')

module.exports = class Config {
  constructor() {
    this.items = {};
  }


  load(filename) {
    try {
      var txt = fs.readFileSync(filename, 'utf8');
    }
    catch(e) {
      return false;
    }

    var lines = txt.split(/\r?\n/);

    for (var currLine of lines) {
      var pair = currLine.split(/=/, 2);
      if ( pair.length == 2 ) {
        this.set(pair[0], pair[1]);
      }
    }

    return true;
  }


  save(filename) {
    var txt = '';
    for (var item in this.items) {
      txt += `${item}=${this.items[item]}\x0d\x0a`;
    }

    try {
      fs.writeFileSync(filename, txt, 'utf8');
      return true;
    }
    catch(e) {
    }
    return false;
  }


  get(key, defVal) {
    return key in this.items ? this.items[key] : defVal;
  }


  set(key, value) {
    this.items[key] = value;
  }


  clear() {
    this.items = {}
  }
};
