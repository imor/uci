'use strict';
/* global suite:true, test:true, done:true */
var assert = require('assert');
var Engine = require('../lib/chessengine.js').Engine;
var os = require('os');

var enginePath;
var prefix = process.cwd() + '/engines/stockfish/';
if (os.platform() === 'linux') {
    enginePath = prefix + 'stockfish-linux';
} else if (os.platform() === 'win32') {
    enginePath = prefix + 'stockfish-3-32-ja.exe';
} else if (os.platform() === 'darwin') {
    enginePath = prefix + 'stockfish-4-32';
}

suite('ChessEngine', function () {
    test('Running an existing engine runs fine', function (done) {
        var engine = new Engine(enginePath);
        engine.start().then(function (engineObj) {
            done();
        }).fail(function (error) {
            throw error;
        }).done();
    });
    test('Running a non-existing engine doesn\'t run', function (done) {
        var engine = new Engine('non-existing-engine');
        engine.start().then(function (engineObj) {
            assert.fail('Engine ran unexpectedly');
        }, function (error) {
            done();
        }).done();
    });
});