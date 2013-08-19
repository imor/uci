var events = require('events');
var util = require('util');
var Q = require('q');
var spawn = require('child_process').spawn;
var path = require('path');
var Chess = require('chess.js').Chess;
var Clock = require('./clock.js').Clock;
var fs = require('fs');

var UCI = function () {
    var self = this;

    self.engines = [];
    var filesToCheck = [];

    var engineRoot = path.normalize(__dirname + path.sep + '..' + path.sep + 'engines');
    findUciEngines(findAllFiles(engineRoot));

    //Recursively finds the files in a folder
    function findAllFiles(rootPath) {
        var result = [];
        var files = fs.readdirSync(rootPath);
        for (var i = 0; i < files.length;i++) {
            var file = rootPath + path.sep + files[i];
            var stat = fs.statSync(file);
            if (stat.isFile()) {
                result.push(file);
            }
            else if (stat.isDirectory()) {
                result = result.concat(findAllFiles(file));
            }
        }
        return result;
    };

    //Given a list of files, finds the UCI engines among them
    function findUciEngines(files) {
        var toTest = files.length;
        for (var i = 0;i < files.length;i++) {
            var file = files[i];
            isUciChessEngine(file, function(engineFile, isEngine) {
                toTest--;
                if (isEngine) {
                    self.engines.push(engineFile);
                }
                if (toTest == 0) {
                    self.emit('ready');
                }
            });
        }
    }

    //callback takes a boolean argument telling if the file is a uci engine
    function isUciChessEngine(file, callback) {
        var proc = spawn(file);
        proc.on('error', function(err) {
            callback(null, false);
        });

        if (proc.pid != 0) {
            run_engine_command(['uci'], 'uciok', findOkResponseInData, proc).then(function () {
                proc.stdin.write('quit\n');
                callback(file, true);
            });
        }
    };

    function findOkResponseInData(data, ok_response) {
        var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
        var arr = str.split(/\n/);
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].replace('\r', '') == ok_response) {
                return true;
            }
        }
        return false;
    }

    function run_engine_command(commands, ok_response, result_checker, engineProc) {
        var engineProc = engineProc ? engineProc : self.engineProc;
        result_checker = result_checker ? result_checker : findOkResponseInData;
        var deferred = Q.defer();
        var engine_stdout_listener = function (data) {
            var result = result_checker(data, ok_response);
            if (result) {
                clearTimeout(timerId);
                engineProc.stdout.removeListener('data', engine_stdout_listener);
                deferred.resolve(result);
            }
        };
        engineProc.stdout.on('data', engine_stdout_listener);
        for (var i = 0; i < commands.length; ++i) {
            engineProc.stdin.write(commands[i] + '\n');
        }

        //TODO:Remove hardcoded timeout limit
        var timeout = 5000;
        var timerId = setTimeout(function () {
            engineProc.stdout.removeListener('data', engine_stdout_listener);
            deferred.reject(new Error("Didn't receive result within " + timeout + " millisecs"));
        }, timeout);
        return deferred.promise;
    }

    function startEngine(engineFilePath, callback) {
        var engine = spawn(engineFilePath);
        self.engineProc = engine;

        engine.on('close', function (code, signal) {
            if (code != 0) {
                self.emit('error', 'Engine process terminated abnormally with code ' + code);
                self.clock.stop();
                return;
            }
            if (signal != null) {
                self.emit('error', 'Engine process killed by signal ' + signal);
                self.clock.stop();
                return;
            }
            self.emit('exit', 'Engine process exited normally');
        });

        run_engine_command(['uci'], 'uciok', findOkResponseInData).then(function () {
            callback();
        });
    }

    function moveExtractor(data, ok_response) {
        var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
        var arr = str.split(/\n/);
        for (var i = 0; i < arr.length; i++) {
            var line = arr[i].replace('\r', '');
            if (line.substring(0, ok_response.length) === ok_response) {
                var moveRegex = /bestmove (.*?) /g;
                var match = moveRegex.exec(line);
                if (match) {
                    return convertToMoveObject(match[1]);
                } else {
                    self.emit('error', 'Invalid format of bestmove. Expected "bestmove <move>". Returned "' + line + '"');
                }
            }
        }
        return false;
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

    function createGoCommand(whiteMillisRemaining, blackMillisRemaining) {
        return ['go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining];
    }

    UCI.prototype.move = function (move) {
        var self = this;
        move = convertToMoveObject(move);
        var validMove = self.chess.move(move);
        if (validMove === null) {
            self.emit('error', 'Invalid move ' + move.from + move.to + (move.promotion == null ? '' : move.promotion));
            return;
        }
        run_engine_command(['position fen ' + self.chess.fen(), 'isready'], 'readyok').then(function () {
            return run_engine_command(createGoCommand(self.clock.getWhiteMillisRemaining, self.clock.getBlackMillisRemaining), 'bestmove', moveExtractor);
        }).then(function (move) {
            self.chess.move(move);
            self.emit('moved', move);
        });
    };

    UCI.prototype.startNewGame = function (engineExecutable, engineSide, gameTimeInMinutes) {
        var self = this;
        if (!(engineSide === 'black' || engineSide === 'white')) {
            self.emit('error', 'Invalid engine side ' + engineSide);
            return;
        }

        startEngine(engineExecutable, function() {
            self.chess = new Chess();
            self.clock = new Clock(gameTimeInMinutes);
            self.clock.on('timeup', function (turn) {
                var result = (turn === 'w' ? '0-1' : '1-0');
                var reason = (turn === 'w' ? "white's" : "black's") + ' time is up';
                self.emit('gameends', result, reason);
            });
            run_engine_command(['ucinewgame', 'isready'], 'readyok').then(function () {
                return run_engine_command(['position startpos', 'isready'], 'readyok');
            }).then(function () {
                self.emit('newgame');
                self.clock.start();
                if (engineSide === 'white') {
                    run_engine_command(createGoCommand(self.clock.getWhiteMillisRemaining, self.clock.getBlackMillisRemaining),
                        'bestmove', moveExtractor).then(function (move) {
                        self.chess.move(move);
                        self.emit('moved', move);
                    });
                }
            });
        });
    };

    UCI.prototype.shutdown = function () {
        var self = this;
        if (self.engineProc) {
            self.engineProc.stdin.write('quit\n');
        }
        if (self.clock) {
            self.clock.stop();
        }
    };

    UCI.prototype.getAvailableEngines = function () {
        var self = this;
        return self.engines;
    };
};
util.inherits(UCI, events.EventEmitter);
exports.UCI = UCI;
