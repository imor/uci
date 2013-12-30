'use strict';

var path = require('path');
var fs = require('fs');
var events = require('events');
var util = require('util');
var Chess = require('chess.js').Chess;
var Polyglot = require('polyglot-chess');
var polyglot = new Polyglot();
var Q = require('q');

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
    self.engineProxies = {};
    function emitReadyEvent() {
        resolved++;
        if (resolved === files.length) {
            if (Object.keys(self.engineProxies).length > 0) {
                self.emit('Ready');
            } else {
                self.emit('Error', 'No engine found.');
            }
        }
    }

    function engineStartedHandler(engineObj) {
        self.engineProxies[engineObj.engineProxy.name] = engineObj.engineProxy;
        engineObj.stop();
        emitReadyEvent();
    }

    function engineStoppedHandler(engineObj){
        engineObj.removeAllListeners('EngineStarted');
        engineObj.removeAllListeners('EngineStopped');
        engineObj.removeAllListeners('Error');
    }

    function errorHandler() {
        emitReadyEvent();
    }

    for (var i = 0;i < files.length;i++) {
        var file = files[i];
        var engine = new Engine(file);
        engine.on('EngineStarted', engineStartedHandler);
        engine.on('EngineStopped', engineStoppedHandler);
        engine.on('Error', errorHandler);
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
    var toReturn = [];
    for (var proxy in this.engineProxies) {
        if (this.engineProxies.hasOwnProperty(proxy)) {
            toReturn.push(this.engineProxies[proxy]);
        }
    }
    return toReturn;
};

UCI.prototype.getAvailableBooks = function () {
    return this.books;
};

function emitEngineMovedEvent(uci, move, bookMove) {
    move = convertToMoveObject(move);
    move = uci.chess.move(move);
    uci.clock.move();
    uci.emit('EngineMoved', move, bookMove);
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
        emitEngineMovedEvent(uci, bookMove, true);
    }
}

//engineProxy can be either a) A string representing the id of a UCI engine
//returned in the _id_ UCI output. OR b) An actual engine proxy object.
UCI.prototype.startNewGame = function (engineProxy, engineSide, gameTimeInMinutes, bookFile) {
    var self = this;
    if (engineSide !== 'black' && engineSide !== 'white') {
        self.emit('Error', 'Invalid engine side ' + engineSide);
        return;
    }

    if (typeof bookFile === 'string') {
        self.currentBook = bookFile;
    }

    var executablePath = engineProxy;
    var setOptions = {};
    if (typeof engineProxy === 'string' && self.engineProxies.hasOwnProperty(engineProxy)) {
        setOptions = self.engineProxies[engineProxy].setOptions;
        executablePath = self.engineProxies[engineProxy].executablePath;
    } else if  (typeof engineProxy === 'object') {
        setOptions = engineProxy.setOptions;
        executablePath = engineProxy.executablePath;
    }

    self.engine = new Engine(executablePath);
    self.engine.on('EngineStarted', function (options) {
        var setOptionPromises = [];
        for (var option in setOptions) {
            setOptionPromises.push(self.engine.setOption(option, setOptions[option]));
        }

        if (setOptionPromises.length > 0) {
            Q.all(setOptionPromises).then(function() {
                self.engine.startNewGame();
            });
        } else {
            self.engine.startNewGame();
        }
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
        emitEngineMovedEvent(self, bestMove, false);
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
    self.clock.move();
    startEngineAnalysis(self);
};

module.exports = UCI;
