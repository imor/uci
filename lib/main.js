var events = require('events');
var util = require('util');
var Q = require('q');
var spawn = require('child_process').spawn;
var path = require('path');
var Chess = require('chess.js').Chess;
var Clock = require('./clock.js').Clock;

var Engine = function () {
    var self = this;
    ////TODO:Remove hardcoded executable name
    var engine = spawn(path.join(__dirname, '../engines/stockfish/stockfish-3-32-ja.exe'));

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

    function checker(data, ok_response) {
        var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
        var arr = str.split(/\n/);
        for (var i = 0; i < arr.length; i++) {
            if (arr[i].replace('\r', '') == ok_response) {
                return true;
            }
        }
        return false;
    }

    function run_engine_command(commands, ok_response, result_checker) {
        result_checker = result_checker ? result_checker : checker;
        var deferred = Q.defer();
        var engine_stdout_listener = function (data) {
            var result = result_checker(data, ok_response);
            if (result) {
                clearTimeout(timerId);
                engine.stdout.removeListener('data', engine_stdout_listener);
                deferred.resolve(result);
            }
        };
        engine.stdout.on('data', engine_stdout_listener);
        for (var i = 0; i < commands.length; ++i) {
            engine.stdin.write(commands[i] + '\n');
        }

        var timeout = 5000;
        var timerId = setTimeout(function () {
            engine.stdout.removeListener('data', engine_stdout_listener);
            deferred.reject(new Error("Didn't receive result within " + timeout + " millisecs"));
        }, timeout);
        return deferred.promise;
    }

    function delay(ms) {
        var deferred = Q.defer();
        setTimeout(deferred.resolve, ms);

        return deferred.promise;
    }

    run_engine_command(['uci'], 'uciok').then(function () {
        self.emit('ready');
    });

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

    self.move = function (move) {
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

    function createGoCommand(whiteMillisRemaining, blackMillisRemaining) {
        return ['go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining];
    }

    self.startNewGame = function (engineSide, gameTimeInMinutes) {
		if (!(engineSide === 'black' || engineSide === 'white')) {
			self.emit('error', 'Invalid engine side ' + engineSide);
			return;
		}
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
    };

    self.shutdown = function () {
        engine.stdin.write('quit\n');
        self.clock.stop();
    }
};
util.inherits(Engine, events.EventEmitter);
exports.Engine = Engine;
