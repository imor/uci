'use strict';

var path = require('path');
var fs = require('fs');
var events = require('events');
var util = require('util');
var Chess = require('chess.js').Chess;
var Polyglot = require('polyglot-chess');
var polyglot = new Polyglot();

var Engine = require('./chessengine.js').Engine;
var chessclock = require('./chessclock.js');
var Clock = chessclock.ChessClock;
var TimeControl = chessclock.TimeControl;

var UCI = function () {
    var self = this;

    self.books = [];
    self.currentBook = '';

    var booksRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'books');
    var enginesRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'engines');

    self.books = findAllFilesIn(booksRoot);
    findUciEnginesIn(findAllFilesIn(enginesRoot), this);
};

util.inherits(UCI, events.EventEmitter);

function findAllFilesIn(searchPath) {
    var result = [];
    var files = fs.readdirSync(searchPath);
    for (var i = 0; i < files.length;i++) {
        var file = searchPath + path.sep + files[i];
        var stat = fs.statSync(file);
        if (stat.isFile()) {
            result.push(file);
        }
        else if (stat.isDirectory()) {
            result = result.concat(findAllFilesIn(file));
        }
    }
    return result;
}

function findUciEnginesIn(files, self) {
    var resolved = 0;
    self.engines = {};
    function emitReadyEvent() {
        resolved++;
        if (resolved === files.length) {
            if (Object.keys(self.engines).length > 0) {
                self.emit('Ready');
            } else {
                self.emit('Error', 'No engine found.');
            }
        }
    }

    for (var i = 0;i < files.length;i++) {
        var file = files[i];
        var engine = new Engine(file);
        engine.on('EngineStarted', function (engineObj) {
            self.engines[engineObj.engineProxy.name] = engineObj.engineProxy;
            engineObj.stop();
            emitReadyEvent();
        }).on('EngineStopped', function (engineObj){
            engineObj.removeAllListeners('EngineStarted');
            engineObj.removeAllListeners('EngineStopped');
            engineObj.removeAllListeners('Error');
        }).on('Error', function () {
            emitReadyEvent();
        });
        engine.start();
    }
}

function convertToMoveObject(move) {
    if (typeof move == 'object') {
        return move;
    }
    var result = {};
    result.from = move.substring(0, 2);
    result.to = move.substring(2, 4);
    if (move.length > 4) {
        result.promotion = move.substring(4);
    }
    return result;
}

function convertToMoveString(move) {
    if (!move || !move.from || !move.to) {
        return '';
    }

    return move.from + move.to + (move.promotion ? move.promotion : '');
}

UCI.prototype.getAvailableEngines = function () {
    return this.engines;
};

UCI.prototype.getAvailableBooks = function () {
    return this.books;
};

function emitEngineMovedEvent(uci, move) {
    move = convertToMoveObject(move);
    move = uci.chess.move(move);
    uci.emit('EngineMoved', move);
    checkAndEmitGameEndedEvent(uci);
}

function checkAndEmitGameEndedEvent(uci, timeup) {
    var result;
    var reason;
    var gameEnded = false;
    if (timeup) {
        result = (uci.chess.turn() === 'w' ? '0-1' : '1-0');
        reason = (uci.chess.turn() === 'w' ? "white's" : "black's") + ' time is up';
        gameEnded = true;
    }
    else if (uci.chess.in_checkmate()) {
        result = (uci.chess.turn() === 'w' ? '0-1' : '1-0');
        reason = (uci.chess.turn() === 'w' ? "white" : "black") + ' is checkmated';
        gameEnded = true;
    }
    else if (uci.chess.in_stalemate()) {
        result = '1/2-1/2';
        reason = (uci.chess.turn() === 'w' ? "white" : "black") + ' is stalemated';
        gameEnded = true;
    }
    else if (uci.chess.in_threefold_repetition()) {
        result = '1/2-1/2';
        reason = 'draw due to threefold repetition';
        gameEnded = true;
    }
    else if (uci.chess.insufficient_material()) {
        result = '1/2-1/2';
        reason = 'draw due to insufficient material';
        gameEnded = true;
    }
    else if (uci.chess.in_draw()) {
        result = '1/2-1/2';
        reason = 'game is a draw';
        gameEnded = true;
    }

    if (gameEnded) {
        uci.emit('GameEnded', result, reason);
        uci.engine.stop();
        uci.engine.removeAllListeners('EngineStarted');
        uci.engine.removeAllListeners('NewGameStarted');
        uci.engine.removeAllListeners('BestMoveFound');
        uci.engine = null;
        uci.clock.stop();
        uci.clock.removeAllListeners('TimeUp');
        uci.clock = null;
    }

    return gameEnded;
}

function startEngineAnalysis(uci) {
    var bookMove = '';
    if (uci.currentBook) {
        bookMove = polyglot.find(uci.chess.fen(), uci.currentBook, false);
    }

    if (bookMove === '') {
        var whiteClockData = uci.clock.getClockData('white');
        var blackClockData = uci.clock.getClockData('black');
        //TODO:Allow setting richer time controls.
        uci.engine.analyzeAndFindBestMove(uci.chess.fen(), whiteClockData.timeRemainingInMillis, blackClockData.timeRemainingInMillis);
    } else {
        emitEngineMovedEvent(uci, bookMove);
    }
}

UCI.prototype.startNewGame = function (engine, engineSide, gameTimeInMinutes, bookFile) {
    var self = this;
    if (engineSide !== 'black' && engineSide !== 'white') {
        self.emit('Error', 'Invalid engine side ' + engineSide);
        return;
    }

    if (typeof bookFile === 'string') {
        self.currentBook = bookFile;
    }

    var executablePath = engine;
    if (typeof engine === 'string' && self.engines.hasOwnProperty(engine)) {
        executablePath = self.engines[engine].executablePath;
    } else if (typeof engine === 'object') {
        executablePath = engine.executablePath;
    }

    self.engine = new Engine(executablePath);
    self.engine.on('EngineStarted', function (options) {
        self.engine.startNewGame();
    }).on('NewGameStarted', function () {
        self.chess = new Chess();
        self.clock = new Clock([new TimeControl(gameTimeInMinutes * 60 * 1000, 0, 0)]);
        self.clock.on('TimeUp', function (turn) {
            checkAndEmitGameEndedEvent(self, true);
        });
        self.clock.start();
        self.emit('NewGameStarted');
        if (engineSide === 'white') {
            startEngineAnalysis(self);
        }
    }).on('BestMoveFound', function (bestMove) {
        emitEngineMovedEvent(self, bestMove);
    }).on('Error', function (error) {
        self.emit('Error', error);
    });
    self.engine.start();
};

UCI.prototype.move = function (move) {
    var self = this;
    var moveObject = convertToMoveObject(move);
    if (checkAndEmitGameEndedEvent(self)) {
        return;
    }

    var validMove = self.chess.move(moveObject);
    if (validMove === null) {
        self.emit('Error', 'Invalid move ' + convertToMoveString(move));
        return;
    }

    var fen = self.chess.fen();
    startEngineAnalysis(self);
};

module.exports = UCI;