'use strict';
/* global suite:true, test:true, done:true */
var assert = require('assert');
var chessclock = require('../lib/chessclock.js');
var Clock = chessclock.ChessClock;
var TimeControl = chessclock.TimeControl;

suite('ChessClock', function () {
    test('TimeUp event is raised for white', function (done) {
        var clock = new Clock([new TimeControl(10, 0, 0)]);
        clock.on('TimeUp', function (turn) {
            assert.equal(turn, 'white');
            done();
        });
        clock.start();
    });
    test('TimeUp event is raised for black', function (done) {
        var clock = new Clock([new TimeControl(10, 0, 0)]);
        clock.on('TimeUp', function (turn) {
            assert.equal(turn, 'black');
            done();
        });
        clock.start();
        clock.move();
    });
    test('Delay works for white', function (done) {
        var clock = new Clock([new TimeControl(99999999, 0, 99999999)]);
        setTimeout(function () {
            assert(clock.getClockData('white').timeRemainingInMillis, 99999999);
            done();
        }, 200);
        clock.start();
    });
    test('Delay works for black', function (done) {
        var clock = new Clock([new TimeControl(99999999, 0, 99999999)]);
        setTimeout(function () {
            assert(clock.getClockData('black').timeRemainingInMillis, 99999999);
            done();
        }, 200);
        clock.start();
        clock.move();
    });
});