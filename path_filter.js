
function filterPath(filterName, data, options) {
  if ( !filterName ) {
    filterName = 'default';
  }

  switch(filterName) {
    case 'default':
    case 'diff':
      return filterPathWithDiff(data, options);
  }
}


function filterPathWithDiff(data, options) {
  var deltaYmax = 0.1;
  if ( options && options.deltaYmax ) {
    deltaYmax = options.deltaYmax;
  }

  var arrIn = data.arrIn;
  var arrStatus = data.arrStatus;
  var arrDeltaYmax = [
    10 * deltaYmax,
    3 * deltaYmax,
    1 * deltaYmax
  ];

  for (deltaYmax of arrDeltaYmax) {
    var arrXY = filterUtils.buildArrayXY(arrIn, arrStatus);
    if ( arrXY.length == 0 ) {
      return undefined;
    }
    if ( arrXY.length == 1 ) {
      return filterUtils.interpolate(arrIn, arrStatus);
    }

    var factors = filterUtils.calcFactors3( arrXY );
    var calcY = x => filterUtils.calcPolinom3(factors, x);
    var n = arrIn.length;

    var y0 = arrStatus[0]
      ? arrIn[0]
      : calcY(0);
    for (var i = 1; i < n; i++) {
      var y1 = arrStatus[i]
        ? arrIn[i]
        : (y0 + calcY(i) - calcY(i - 1));
      if ( Math.abs(y1 - y0) > deltaYmax ) {
        arrStatus[i] = 0;
      }
      y0 = y1;
    }
  }

  return filterUtils.interpolate(arrIn, arrStatus);
}


var filterUtils = {
  getTrueCount: function (arrIn) {
    var count = 0;
    arrIn && arrIn.forEach(value => {
      if ( value ) {
        count++;
      }
    });
    return count;
  },

  calcDeterminant3: function(a) {
    return  a[0][0]*a[1][1]*a[2][2] +
            a[0][1]*a[1][2]*a[2][0] +
            a[0][2]*a[1][0]*a[2][1] -
            a[0][0]*a[1][2]*a[2][1] -
            a[0][1]*a[1][0]*a[2][2] -
            a[0][2]*a[1][1]*a[2][0];
  },

  solveLinear3: function(arrIn) {
    var n = 3;
    var desI = [0, 0, 0];
    var matrix = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];

    for (var i = 0; i < n; i++) {
      matrix[i][0] = arrIn[i][0];
      matrix[i][1] = arrIn[i][1];
      matrix[i][2] = arrIn[i][2];
    }
    var des = this.calcDeterminant3(matrix);
    if ( !(des) ) {
      return null;
    }

    for (i = 0; i < n; i++) {
      matrix[i][0] = arrIn[i][3];
      matrix[i][1] = arrIn[i][1];
      matrix[i][2] = arrIn[i][2];
    }
    desI[0] = this.calcDeterminant3(matrix);


    for (i = 0; i < n; i++) {
      matrix[i][0] = arrIn[i][0];
      matrix[i][1] = arrIn[i][3];
      matrix[i][2] = arrIn[i][2];
    }
    desI[1] = this.calcDeterminant3(matrix);


    for (i = 0; i < n; i++) {
      matrix[i][0] = arrIn[i][0];
      matrix[i][1] = arrIn[i][1];
      matrix[i][2] = arrIn[i][3];
    }
    desI[2] = this.calcDeterminant3(matrix);


    var aout = [];
    for (i = 0; i < 3; i++) {
      aout.push( desI[i]/des );
    }
    return aout;
  },

  /*
    * Method of least squeares
    */
  calcFactors3: function(arrIn) {
    var n = arrIn.length;

    var x;
    var y;
    var mx = 0.0;
    var my = 0.0;
    var mxy = 0.0;
    var mx2y = 0.0;
    var mx2 = 0.0;
    var mx3 = 0.0;
    var mx4 = 0.0;

    for (var i = 0; i < n; i++) {
      x = arrIn[i][0];
      y = arrIn[i][1];
      mx += x;
      my += y;
      mxy += x*y;
      x2 = x*x;
      mx2y += x2*y;
      mx2 += x2;
      mx3 += x2*x;
      mx4 += x2*x2;
    }

    if ( n ) {
      return this.solveLinear3([[mx4, mx3, mx2, mx2y],
                                [mx3, mx2, mx,  mxy],
                                [mx2, mx,  n,   my]]);
    }

    return null;
  },

  calcPolinom3: function(factors, arg) {
    return  factors[0]*arg*arg +
            factors[1]*arg +
            factors[2];
  },

  buildArrayXY: function(arrIn, arrStatus) {
    var arrOut = [];
    var n = arrIn.length;
    for (var i = 0; i < n; i++) {
      if ( !arrStatus || arrStatus[i]) {
        arrOut.push( [i, arrIn[i]] );
      }
    }
    return arrOut;
  },

  makeGood: function(arrStatus) {
    var n = arrStatus.length;
    for (var i = 0; i < n; i++) {
      arrStatus[i] = 1;
    }
  },

  interpolate: function(arrIn, arrStatus) {
    var n = arrIn.length;
    var arrOut = [];
    for (var i = 0; i < n; i++) {
      arrOut.push( arrIn[i] );
    }

    var index0;

    var doInterpolation = function(loIndex, hiIndex) {
      if ( loIndex === undefined) {
        var value = arrOut[hiIndex];
        for (var i = 0; i < hiIndex; i++) {
          arrOut[i] = value;
        }
      }
      else {
        var y0 = arrOut[loIndex];
        var y1 = arrOut[hiIndex];
        for (var i = loIndex + 1; i < hiIndex; i++) {
          arrOut[i] = y0 + (i - loIndex)*(y1 - y0)/(hiIndex - loIndex);
        }
      }
    }

    for (var i = 0; i < n; i++) {
      if ( !arrStatus[i] ) {
        continue;
      }
      if (i - 1 !== index0) {
        doInterpolation(index0, i);
      }
      index0 = i;
    }

    if ( index0 != i ) {
      if ( index0 === undefined) {
        for (i = 0; i < n; i++) {
          arrOut[i] = 0;
        }
      }
      else {
        var value = arrOut[index0];
        for (i = index0 + 1; i < n; i++) {
          arrOut[i] = value;
        }
      }
    }

    return arrOut;
  },
}


module.exports = {
  filterPath: filterPath,
  utils: filterUtils,
}
