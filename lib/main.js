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

function endCurrentGameInternal(uci, result, reason) {
    uci.emit('GameEnded', result, reason);
    uci.engine.stop().fail(uci.errorHandler).done();
    uci.engine = null;
    uci.clock.stop();
    uci.clock.removeAllListeners('TimeUp');
    uci.clock = null;
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
            return internalMove(uci, bestMove, false);
        });
    } else {
        var deferred = Q.defer();
        process.nextTick(function () {
            deferred.resolve(internalMove(uci, bookMove, true));
        });
        return deferred.promise;
    }
}

function internalMove(uci, move, bookMove) {
    var originalMove = move;
    move = utilities.convertToMoveObject(move);
    move = uci.chess.move(move);
    if (move === null) {
        uci.errorHandler('Invalid move ' + utilities.convertToMoveString(originalMove));
        return originalMove;
    }

    var ended = utilities.hasGameEnded(uci.chess);

    if (ended) {
        endCurrentGameInternal(uci, ended.result, ended.reason);
    } else {
        uci.clock.move();

        if (utilities.isEnginesTurn(uci.engineSide, uci.chess.turn())) {
            startEngineAnalysis(uci).fail(uci.errorHandler).done();
        } else {
            uci.emit('EngineMoved', move, bookMove);
        }
    }

    return move;
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
    self.engineSide = engineSide;
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
    self.engine.start().then(function (engineObj) {
        var setOptionPromises = [];
        setOptionPromises.push(utilities.createNextTickResolvingPromise());
        for (var option in setOptions) {
            setOptionPromises.push(self.engine.setOption(option, setOptions[option]));
        }

        return Q.all(setOptionPromises).then(function() {
            return self.engine.startNewGame().then(function () {
                self.chess = new Chess();
                self.clock = new Clock([new TimeControl(gameTimeInMinutes * 60 * 1000, 0, 0)]);
                self.clock.on('TimeUp', function (turn) {
                    var result = (self.chess.turn() === 'w' ? '0-1' : '1-0');
                    var reason = (self.chess.turn() === 'w' ? "white's" : "black's") + ' time is up';
                    endCurrentGameInternal(self, result, reason);
                });
                self.clock.start();
                self.emit('NewGameStarted');
                if (engineSide === 'white') {
                    return startEngineAnalysis(self);
                }
            });
        });
    }).fail(self.errorHandler).done();
};

//TODO:Check that result is valid
UCI.prototype.endCurrentGame = function (result, reason) {
    endCurrentGameInternal(this, result, reason);
};

UCI.prototype.move = function (move) {
    return internalMove(this, move, false);
};

module.exports = UCI;
