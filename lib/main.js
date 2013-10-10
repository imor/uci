'use strict';
var events = require('events');
var util = require('util');
var Q = require('q');
var spawn = require('child_process').spawn;
var path = require('path');
var Chess = require('chess.js').Chess;
var Clock = require('./clock.js').Clock;
var fs = require('fs');
var mime = require('mime-magic');
var os = require('os');
var Polyglot = require('polyglot-chess').Polyglot;
var polyglot = new Polyglot();

function raiseGameendsEvent(uci, timeup) {
    var result;
    var reason;
    if (timeup) {
        result = (uci.chess.turn() === 'w' ? '0-1' : '1-0');
        reason = (uci.chess.turn() === 'w' ? "white's" : "black's") + ' time is up';
        uci.emit('gameends', result, reason);
    }
    else if (uci.chess.in_checkmate()) {
        result = (uci.chess.turn() === 'w' ? '0-1' : '1-0');
        reason = (uci.chess.turn() === 'w' ? "white" : "black") + ' is checkmated';
        uci.emit('gameends', result, reason);
    }
    else if (uci.chess.in_stalemate()) {
        result = '1/2-1/2';
        reason = (uci.chess.turn() === 'w' ? "white" : "black") + ' is stalemated';
        uci.emit('gameends', result, reason);
    }
    else if (uci.chess.in_threefold_repetition()) {
        result = '1/2-1/2';
        reason = 'draw due to threefold repetition';
        uci.emit('gameends', result, reason);
    }
    else if (uci.chess.insufficient_material()) {
        result = '1/2-1/2';
        reason = 'draw due to insufficient material';
        uci.emit('gameends', result, reason);
    }
    else if (uci.chess.in_draw()) {
        result = '1/2-1/2';
        reason = 'game is a draw';
        uci.emit('gameends', result, reason);
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

function raiseMovedEvent(uci, move) {
    move = uci.chess.move(convertToMoveObject(move));
    if (move) {
        uci.emit('moved', move);
    } else {
        raiseGameendsEvent(uci, false);
    }
}

function createGoCommand(whiteMillisRemaining, blackMillisRemaining) {
    return ['go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining];
}

function isExecutableMimeType(mimeType) {
    if ((os.platform() === 'linux' && mimeType === 'application/x-executable') ||
            (os.platform() === 'win32' && mimeType === 'application/x-dosexec')) {
        return true;
    }
    return false;
}

function findOkResponseInData(uci, data, okResponse) {
    var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
    var arr = str.split(/\n/);
    for (var i = 0; i < arr.length; i++) {
        if (arr[i].replace('\r', '') == okResponse) {
            return true;
        }
    }
    return false;
}

function moveExtractor(uci, data, okResponse) {
    var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
    var arr = str.split(/\n/);
    for (var i = 0; i < arr.length; i++) {
        var line = arr[i].replace('\r', '');
        if (line.substring(0, okResponse.length) === okResponse) {
            var moveRegex = /bestmove (.*?) /g;
            var match = moveRegex.exec(line);
            if (match) {
                return convertToMoveObject(match[1]);
            } else {
                uci.emit('error', 'Invalid format of bestmove. Expected "bestmove <move>". Returned "' + line + '"');
            }
        }
    }
    return false;
}

function runEngineCommand(uci, commands, okResponse, resultChecker, engineProc) {
    engineProc = engineProc ? engineProc : uci.engineProc;
    resultChecker = resultChecker ? resultChecker : findOkResponseInData;
    var deferred = Q.defer();
    var engineStdoutListener = function (data) {
        var result = resultChecker(uci, data, okResponse);
        if (result) {
            clearTimeout(timerId);
            engineProc.stdout.removeListener('data', engineStdoutListener);
            deferred.resolve(result);
        }
    };
    engineProc.stdout.on('data', engineStdoutListener);
    for (var i = 0; i < commands.length; ++i) {
        engineProc.stdin.write(commands[i] + '\n');
    }

    //TODO:Remove hardcoded timeout limit
    var timeout = 100000;
    var timerId = setTimeout(function () {
        engineProc.stdout.removeListener('data', engineStdoutListener);
        deferred.reject(new Error("Didn't receive result within " + timeout + " millisecs"));
    }, timeout);
    return deferred.promise;
}

function startEngine(uci, engineFilePath, callback) {
    var engine = spawn(engineFilePath);
    uci.engineProc = engine;

    engine.on('close', function (code, signal) {
        if (code !== 0) {
            uci.emit('error', 'Engine process terminated abnormally with code ' + code);
            uci.clock.stop();
            return;
        }
        if (signal !== null) {
            uci.emit('error', 'Engine process killed by signal ' + signal);
            uci.clock.stop();
            return;
        }
        uci.emit('exit', 'Engine process exited normally');
    });

    runEngineCommand(uci, ['uci'], 'uciok', findOkResponseInData).then(function () {
        callback();
    });
}

//Recursively finds the files in a folder
function findAllFilesIn(rootPath) {
    var result = [];
    var files = fs.readdirSync(rootPath);
    for (var i = 0; i < files.length;i++) {
        var file = rootPath + path.sep + files[i];
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

function findExecutableFilesIn(files, callback) {
    var toTest = files.length;
    var result = [];

    function createCallback(capturedFile) {
        return function(err, type) {
            toTest--;
            if (!err && isExecutableMimeType(type)) {
                result.push(capturedFile);
            }
            if (toTest === 0) {
                callback(result);
            }
        };
    }

    for (var i = 0;i < files.length;i++) {
        var file = files[i];
        mime(file, createCallback(file));
    }
}

//Given a list of files, finds the UCI engines among them
function findUciEnginesIn(uci, files) {
    var toTest = files.length;
    function isUciEngineCallback(engineFile, isEngine) {
        toTest--;
        if (isEngine) {
            uci.engines.push(engineFile);
        }
        if (toTest === 0) {
            uci.emit('ready');
        }
    }
    for (var i = 0;i < files.length;i++) {
        var file = files[i];
        isUciChessEngine(uci, file, isUciEngineCallback);
    }
}

//callback takes a boolean argument telling if the file is a uci engine
function isUciChessEngine(uci, file, callback) {
    var proc = spawn(file);
    proc.on('error', function(err) {
        callback(null, false);
    });

    if (proc.pid !== 0) {
        runEngineCommand(uci, ['uci'], 'uciok', findOkResponseInData, proc).then(function () {
            proc.stdin.write('quit\n');
            callback(file, true);
        });
    }
}

var UCI = function () {
    var self = this;

    self.engines = [];
    self.books = [];
    self.currentBook = '';

    var booksRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'books');
    self.books = findAllFilesIn(booksRoot);
    var enginesRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'engines');
    findExecutableFilesIn(findAllFilesIn(enginesRoot), function (executableFiles) {
       findUciEnginesIn(self, executableFiles);
    });
};

util.inherits(UCI, events.EventEmitter);

UCI.prototype.move = function (move) {
    var self = this;
    move = convertToMoveObject(move);
    var validMove = self.chess.move(move);
    if (validMove === null) {
        self.emit('error', 'Invalid move ' + move.from + move.to + (move.promotion ? move.promotion : ''));
        return;
    }
    var fen = self.chess.fen();
    var bookMove = '';
    if (self.currentBook) {
        bookMove = polyglot.find(fen, self.currentBook, false);
    }
    if (bookMove === '') {
        runEngineCommand(self, ['position fen ' + fen, 'isready'], 'readyok').then(function () {
            return runEngineCommand(self, createGoCommand(self.clock.getWhiteMillisRemaining(), self.clock.getBlackMillisRemaining()), 'bestmove', moveExtractor);
        }).then(function (move) {
            raiseMovedEvent(self, move);
        });
    } else {
        raiseMovedEvent(self, bookMove);
    }
};

UCI.prototype.startNewGame = function (engineExecutable, engineSide, gameTimeInMinutes, bookFile) {
    var self = this;
    if (!(engineSide === 'black' || engineSide === 'white')) {
        self.emit('error', 'Invalid engine side ' + engineSide);
        return;
    }

    if (typeof bookFile === 'string') {
        self.currentBook = bookFile;
    }

    startEngine(self, engineExecutable, function() {
        self.chess = new Chess();
        self.clock = new Clock(gameTimeInMinutes);
        self.clock.on('timeup', function (turn) {
            raiseGameendsEvent(self, true);
        });
        runEngineCommand(self, ['ucinewgame', 'isready'], 'readyok').then(function () {
            return runEngineCommand(self, ['position startpos', 'isready'], 'readyok');
        }).then(function () {
            self.emit('newgame');
            self.clock.start();
            if (engineSide === 'white') {
                runEngineCommand(self, createGoCommand(self.clock.getWhiteMillisRemaining(), self.clock.getBlackMillisRemaining()),
                    'bestmove', moveExtractor).then(function (move) {
                    raiseMovedEvent(self, move);
                });
            }
        });
    });
};

UCI.prototype.shutdown = function () {
    if (this.engineProc) {
        this.engineProc.stdin.write('quit\n');
    }
    if (this.clock) {
        this.clock.stop();
    }
};

UCI.prototype.getAvailableEngines = function () {
    return this.engines;
};

UCI.prototype.getAvailableBooks = function () {
    return this.books;
};

exports.UCI = UCI;
