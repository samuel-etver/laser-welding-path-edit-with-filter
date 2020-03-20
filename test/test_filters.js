
const chai = require('chai')
const mocha = require('mocha')

const expect = chai.expect;

const filters = require('../path_filter.js')

const filterUtils = filters.utils;


describe('Calculating Determinant Test', () => {
    let calcDeterminant3 = (arg) => filterUtils.calcDeterminant3(arg);
    it('Calculating Determinant', () => {
        let value = calcDeterminant3([[2,3,1], [5, 8, 3], [-2, 0, 5]]);
        expect(value).to.equal(3);
    });
    it('Calulcating Determinant', () => {
        let value = calcDeterminant3([[3, 3, -1], [4, 1, 3], [1, -2, -2]]);
        expect(value).to.equal(54);
    });
    it('Calulcating Determinant', () => {
        let value = calcDeterminant3([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
        expect(value).to.equal(0);
    });
});

describe('Linear Equation Test', () => {
    let solveLinear3 = arg => filterUtils.solveLinear3(arg);
    it('Solve Linear Equation', () => {
        let result = solveLinear3([[2, 3, -1, 9], [1, -2, 1, 3], [1, 0, 2, 2]]);
        expect(result[0]).to.be.closeTo( 4.0, 1e-7);
        expect(result[1]).to.be.closeTo( 0.0, 1e-7);
        expect(result[2]).to.be.closeTo(-1.0, 1e-7);
    });
    it('Solve Linear Equation', () => {
        let result = solveLinear3([[1, 2, 3, 6], [4, 5, 6, 9], [7, 8, 0, -6]]);
        expect(result[0]).to.be.closeTo(-2.0, 1e-7);
        expect(result[1]).to.be.closeTo( 1.0, 1e-7);
        expect(result[2]).to.be.closeTo( 2.0, 1e-7);
    });
});

describe('Least Squares Method Test', () => {
    let calcFactors3 = arg => filterUtils.calcFactors3(arg);
    let buildArrayXY = (arg1, arg2) => filterUtils.buildArrayXY(arg1, arg2);
    let calc = (arg1, arg2) => calcFactors3(buildArrayXY(arg1, arg2));
    let errVal = -1000;
    let buildStatuses = function(ain) {
        let aout = [];
        ain.forEach(a => aout.push(a == errVal ? 0 : 1));
        return aout;
    }

    it('Using Least Squares Method', () => {
        let dots     = [0, 1, 2, errVal, errVal, 5, 6, errVal];
        let statuses = buildStatuses( dots );
        let result = calc(dots, statuses);
        expect(result[0]).to.be.closeTo(0.0, 1e-7);
        expect(result[1]).to.be.closeTo(1.0, 1e-7);
        expect(result[2]).to.be.closeTo(0.0, 1e-7);
    });

    it('Using Least Squares Method', () => {
        let dots     = [0.1, 0.1, 0.2, 0.2, 0.0, 0.0];
        let statuses = buildStatuses( dots );
        let result = calc(dots, statuses);
        expect(result[0]).to.be.closeTo( -0.02142857, 1e-7);
        expect(result[1]).to.be.closeTo(  0.08428571, 1e-7);
        expect(result[2]).to.be.closeTo(  0.08571428, 1e-7);
    });

    it('Using Least Squares Method', () => {
        let dots     = [0.1, 0.1, 0.2, 0.2, 0.0, 0.0, errVal];
        let statuses = buildStatuses( dots );
        let result = calc(dots, statuses);
        expect(result[0]).to.be.closeTo( -0.02142857, 1e-7);
        expect(result[1]).to.be.closeTo(  0.08428571, 1e-7);
        expect(result[2]).to.be.closeTo(  0.08571428, 1e-7);
    });
});

describe('Polinom Calcuation Test', () => {
    let calc = (factors, x) => filterUtils.calcPolinom3(factors, x);

    it('Calculating polinom', () => {
        let result = calc([1.0, 2.0, 3.0], 2.0);
        expect(result).to.be.closeTo(11, 1e-7);
    });

    it('Calculating polinom', () => {
        let result = calc([-0.9, 0.5, 0.13], 0.83);
        expect(result).to.be.closeTo(-0.075010, 1e-7);
    });
});

describe('Interpolation Test', () => {
    let errVal = -1000;
    let val = 10;

    it('Interpolating data', () => {
        let arrIn = [errVal, errVal, errVal, val];
        let arrStatus = [0, 0, 0, 1];
        var result = filterUtils.interpolate(arrIn, arrStatus);
        expect(result[0]).to.be.closeTo(val, 1e-7);
        expect(result[1]).to.be.closeTo(val, 1e-7);
        expect(result[2]).to.be.closeTo(val, 1e-7);
        expect(result[3]).to.be.closeTo(val, 1e-7);
    });

    it('Interpolating data', () => {
        let arrIn = [val, errVal, errVal, errVal];
        let arrStatus = [1, 0, 0, 0];
        var result = filterUtils.interpolate(arrIn, arrStatus);
        expect(result[0]).to.be.closeTo(val, 1e-7);
        expect(result[1]).to.be.closeTo(val, 1e-7);
        expect(result[2]).to.be.closeTo(val, 1e-7);
        expect(result[3]).to.be.closeTo(val, 1e-7);
    });

    it('Interpolating data', () => {
        let arrIn = [errVal, errVal, errVal, errVal];
        let arrStatus = [0, 0, 0, 0];
        var result = filterUtils.interpolate(arrIn, arrStatus);
        expect(result[0]).to.be.closeTo(0, 1e-7);
        expect(result[1]).to.be.closeTo(0, 1e-7);
        expect(result[2]).to.be.closeTo(0, 1e-7);
        expect(result[3]).to.be.closeTo(0, 1e-7);
    });

    it('Interpolating data', () => {
        let arrIn = [0, errVal, errVal, 3];
        let arrStatus = [1, 0, 0, 1];
        var result = filterUtils.interpolate(arrIn, arrStatus);
        expect(result[0]).to.be.closeTo(0, 1e-7);
        expect(result[1]).to.be.closeTo(1, 1e-7);
        expect(result[2]).to.be.closeTo(2, 1e-7);
        expect(result[3]).to.be.closeTo(3, 1e-7);
    });
});

describe('Diff Filter Test', () => {
    it('Testing filter. Not checking signal filtering quality!', () => {
        var arrIn = [0, 0, 0, 1, 0];
        var arrStatus = [1, 1, 1, 1, 1];
        var inData  = {
            arrIn: arrIn,
            arrStatus: arrStatus
        };
        var result = filters.filterPath('diff', inData, {
            deltaXmax: 0.1
        });
    });

    it('Testing filter. Not checking signal filtering quality!', () => {
        var arrIn = [];
        var arrStatus = [];
        for (var i = 0; i < 1000; i++) {
          arrIn.push( i + (Math.random() - 0.5)/10 );
          arrStatus.push( i + ((Math.random() + 0.7) >> 0) );
        }
        var inData  = {
            arrIn: arrIn,
            arrStatus: arrStatus
        };
        var result = filters.filterPath('diff', inData, {
            deltaXmax: 0.1
        });
    });
});
