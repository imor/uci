'use strict';

var path = require('path');
var events = require('events');
var util = require('util');
var Chess = require('chess.js').Chess;
var Polyglot = require('polyglot-chess');
var polyglot = new Polyglot();
var Q = require('q');

var chessclock = require('./chessclock.js');
var Clock = chessclock.ChessClock;
var TimeControl = chessclock.TimeControl;
var utilities = require('./utilities.js');
var Engine = require('./chessengine.js').Engine;

var UCI = function () {
    var self = this;

    self.errorHandler = function (error) {
        self.emit('Error', error);
    };

    var booksRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'books');
    var enginesRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'engines');

    self.currentBook = '';
    self.books = utilities.findAllFilesIn(booksRoot);
    utilities.findUciEnginesAmong(utilities.findAllFilesIn(enginesRoot)).then(function (engineProxies) {
        self.engineProxies = engineProxies;
        self.emit('Ready');
    }).fail(function (error) {
        self.errorHandler(error);
    }).done();
};

util.inherits(UCI, events.EventEmitter);

function emitEngineMovedEvent(uci, move, bookMove) {
    move = utilities.convertToMoveObject(move);
    move = uci.chess.move(move);
    uci.clock.move();
    uci.emit('EngineMoved', move, bookMove);
    checkAndEmitGameEndedEvent(uci);
    return move;
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
        uci.engine.stop().fail(uci.errorHandler).done();
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
        return uci.engine.analyzeAndFindBestMove(uci.chess.fen(),
                whiteClockData.timeRemainingInMillis,
                blackClockData.timeRemainingInMillis).then(function (bestMove) {
            return emitEngineMovedEvent(uci, bestMove, false);
        });
    } else {
        var deferred = Q.defer();
        process.nextTick(function () {
            deferred.resolve(emitEngineMovedEvent(uci, bookMove, true));
        });
        return deferred.promise;
    }
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

    function startNewGameHandler () {
        self.chess = new Chess();
        self.clock = new Clock([new TimeControl(gameTimeInMinutes * 60 * 1000, 0, 0)]);
        self.clock.on('TimeUp', function (turn) {
            checkAndEmitGameEndedEvent(self, true);
        });
        self.clock.start();
        self.emit('NewGameStarted');
        if (engineSide === 'white') {
            return startEngineAnalysis(self);
        }
    }

    self.engine = new Engine(executablePath);
    self.engine.start().then(function (engineObj) {
        var setOptionPromises = [];
        for (var option in setOptions) {
            setOptionPromises.push(self.engine.setOption(option, setOptions[option]));
        }

        if (setOptionPromises.length > 0) {
            return Q.all(setOptionPromises).then(function() {
                return self.engine.startNewGame().then(startNewGameHandler);
            });
        } else {
            return self.engine.startNewGame().then(startNewGameHandler);
        }
    }).fail(self.errorHandler).done();
};

UCI.prototype.move = function (move) {
    var self = this;
    var moveObject = utilities.convertToMoveObject(move);
    if (checkAndEmitGameEndedEvent(self)) {
        return;
    }

    var validMove = self.chess.move(moveObject);
    if (validMove === null) {
        self.errorHandler('Invalid move ' + utilities.convertToMoveString(move));
        return;
    }

    var fen = self.chess.fen();
    self.clock.move();
    startEngineAnalysis(self).fail(self.errorHandler).done();
};

module.exports = UCI;
