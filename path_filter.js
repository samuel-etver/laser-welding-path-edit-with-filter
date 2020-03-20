
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

  var calcAverageWithWindow = function(arrIn, index) {
    var arrOut = [];
    var wndSize = 33;
    var currIndex = index - (wndSize >> 2);
    for (var i = 0; i < wndSize; i++) {
        if ( currIndex < 0 ) {
          var value = arrIn[0];
        }
        else if ( currIndex >= arrIn.length ) {
          value = arrIn[arrIn.length - 1];
        }
        else {
          value = arrIn[currIndex];
        }
        arrOut.push( value );
        currIndex++;
    }
    arrOut.sort();
    return arrOut[wndSize >> 2];
  }

  var arrStatus = data.arrStatus;
  var arrInterpolated = filterUtils.interpolate(data.arrIn, arrStatus);
  var n = arrInterpolated.length;
  var arrIn = [];
  for (var i = 0; i < n; i++) {
    arrIn.push( calcAverageWithWindow(arrInterpolated, i) );
  }

  var arrXY = filterUtils.buildArrayXY(arrIn, arrStatus);
  if ( arrXY.length == 0 ) {
    return undefined;
  }
  if ( arrXY.length <= 2 ) {
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

//  return filterUtils.interpolate(arrIn, arrStatus);
  return filterUtils.approximate(arrIn, arrStatus);
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

  approximate: function(arrIn, arrStatus, options) {
    var countMin = 50;
    var sliceSize = 200;
    var overloadSize = 100;

    if ( options ) {
      if ( options.countMin ) {
        countMin = options.countMin;
      }
      if ( options.sliceSize ) {
        sliceSize = options.sliceSize;
      }
      if ( options.overloadSize ) {
        oveloadSize = options.overloadSize;
      }
    }

    var dotsCount = arrIn.length;
    var goodDotsCount = this.getTrueCount(arrStatus);
    if ( goodDotsCount < countMin ) {
      return this.interpolate(arrIn, arrStatus);
    }

    var sliceCount = ((goodDotsCount - overloadSize) / (sliceSize - overloadSize))  >> 0;
    if ( sliceCount < 1 ) {
      sliceCount = 1;
    }
    if (sliceCount == 1) {
      sliceSize = goodDotsCount;
    }
    else {
      sliceSize =  overloadSize + (((goodDotsCount - overloadSize) / sliceCount) >> 0);
    }
    var firstSliceSize = sliceCount == 1
      ? goodDotsCount
      : (goodDotsCount - (sliceSize - overloadSize)*(sliceCount - 1));


    var arrSlices = [];
    var arrCurrY = [];
    var arrNextY = [];
    var arrCurrStatus = [];
    var arrNextStatus = [];
    var currSliceSize = firstSliceSize;
    var currItemIndex = 0;
    var nextI = 0;
    var currStartI = 0;

    for (var sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
      for (var i = currStartI; i < currSliceSize; ) {
        var y      = arrIn[currItemIndex];
        var status = arrStatus[currItemIndex];
        arrCurrY.push( y );
        arrCurrStatus.push( status );

        if ( i >= (currSliceSize - overloadSize) ) {
          if ( arrNextY.startIndex === undefined ) {
            arrNextY.startIndex = currItemIndex;
          }
          arrNextY.push( y );
          arrNextStatus.push( status );
          if ( status ) {
            nextI++;
          }
        }

        if ( status ) {
          i++;
        }

        currItemIndex++;
      }

      arrSlices.push({
        arrY: arrCurrY,
        arrStatus: arrCurrStatus
      });
      currSliceSize = sliceSize;
      arrNextY.endIndex = currItemIndex;
      arrCurrY = arrNextY;
      arrCurrStatus = arrNextStatus;
      arrNextY = [];
      arrNextStatus = [];
      currStartI = nextI;
      nextI = 0;
    }


    arrCurrY = arrSlices[arrSlices.length - 1].arrY;
    arrStatusY = arrSlices[arrSlices.length - 1].arrStatus;
    while (currItemIndex < dotsCount) {
      arrCurrY.push( arrIn[currItemIndex] );
      arrCurrStatus.push ( 0 );
      currItemIndex++;
    }

    var arrAllFactors = [];
    for (sliceIndex = 0; sliceIndex < sliceCount; sliceIndex++) {
      var currSlice = arrSlices[sliceIndex];
      var arrCurrXY = this.buildArrayXY(currSlice.arrY, currSlice.arrStatus);
      var arrCurrFactors = this.calcFactors3(arrCurrXY);
      arrAllFactors.push( arrCurrFactors );
    }


    var arrOut = [];
    var n = arrSlices[0].arrY.length;
    var arrCurrFactors = arrAllFactors[0];
    var calcY = x => this.calcPolinom3( arrCurrFactors, x);
    for (var i = 0; i < n; i++) {
      arrOut.push ( calcY(i) );
    }
    for( ; i < dotsCount; i++) {
      arrOut.push( 0 );
    }
    var calcWeight = index => (index / (endIndex - startIndex));


    for (sliceIndex = 1; sliceIndex < sliceCount; sliceIndex++) {
      var currSlice = arrSlices[sliceIndex];
      currArrY = currSlice.arrY;
      currArrayStatus = currSlice.arrStatus;
      n = currArrY.length;
      var startIndex = currArrY.startIndex;
      var endIndex   = currArrY.endIndex;
      var currDotIndex = startIndex;
      arrCurrFactors = arrAllFactors[sliceIndex];
      for (i = 0; i < n; i++) {
        if ( currDotIndex < endIndex ) {
          var weight = calcWeight(i);
          arrOut[currDotIndex] =
            arrOut[currDotIndex] * (1 - weight) +
            calcY(i) * weight;
        }
        else {
          arrOut[currDotIndex] = calcY(i);
        }
        currDotIndex++;
      }
    }

    return arrOut;
    //return this.interpolate(arrIn, arrStatus);
  }
}


module.exports = {
  filterPath: filterPath,
  utils: filterUtils,
}
