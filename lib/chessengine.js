'use strict';

//Introduction
//-------------
//
//To avoid confusion, in this document the term UCI engine refers to a chess
//engine which implements the Universal Chess Interface while the term Engine
//refers to the Engine object exported from this module.

//A UCI engine is a command line program which accepts commands on the standard
//input and gives output on the standard output. This module translates the text
//language of the UCI engine into EventEmitter events on one hand and the
//function calls on the Engine object into the UCI engine text commands on the
//other.
//
//As the UCI engine command output is inherrently asynchronous a method was
//required to capture this asyncrhonous output once a command is sent to the
//UCI engine. This is done by a command in this module. A command is an object
//with a function named run which when called sends a text command to the UCI
//engine and returns a javascript promise. This promise is resolved when the UCI
//engine produces an output expected by that command. Promises prove helpful
//when it is required to chain multiple commands together to achieve something
//useful like analyzing a position.

var events = require('events');
var util = require('util');
var spawn = require('child_process').spawn;
var Q = require('q');
var endOfLine = require('os').EOL;
var endOfLineRegExp = new RegExp(endOfLine);
var S = require('string');

var Engine = function (engineExecutablePath) {
    this.engineExecutablePath = engineExecutablePath;
};

util.inherits(Engine, events.EventEmitter);

//isready command
//---------------
//This command sends an _isready_ command. It returns a promise which is
//resolved once the UCI engine responds with _readyok_.
var isReadyCommand = {
    run: function (engineProcess) {
        var self = this;
        var deferred = Q.defer();

        var engineStdoutListener = function (data) {
            var lines = data.toString().split(endOfLineRegExp);
            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === 'readyok') {
                    engineProcess.stdout.removeListener('data', engineStdoutListener);
                    deferred.resolve();
                }
            }
        };

        engineProcess.stdout.on('data', engineStdoutListener);
        engineProcess.stdin.write('isready' + endOfLine);
        return deferred.promise;
    }
};

//uci command
//-----------
//This commands sends a _uci_ command to the UCI engine. It returs a promise
//which is resolved once the UCI engine responds with _uciok_.
var uciCommand = {
    run: function (engineProcess) {
        var self = this;
        var deferred = Q.defer();

        var options = [];
        //TODO:parse options
        var engineStdoutListener = function (data) {
            var lines = data.toString().split(endOfLineRegExp);

            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === 'uciok') {
                    engineProcess.stdout.removeListener('data', engineStdoutListener);
                    deferred.resolve(options);
                } else {
                    var stringifiedLine = S(lines[i]);
                    if (stringifiedLine.startsWith('option')) {
                        options.push(lines[i]);
                    }
                }
            }
        };

        engineProcess.stdout.on('data', engineStdoutListener);
        engineProcess.stdin.write('uci' + endOfLine);
        return deferred.promise;
    }
};

//Commands without any output
//---------------------------
//Not all UCI commands produce an output. Two examples are the _position_ and
//the _ucinewgame_ commands. For such commands how do you know if the UCI engine
//is working on your command or has an infinite loop and is hung forever? You
//don't. As a workaround these commands send an _isready_ command at the end
//which fortunately produces the _readyok_ output.

//position command
//----------------
//This command sends a _position fen FenString_ command and returns a promise.
//After this command it also sends a _isready_ command and the promise is
//resolved when the UCI engine produces the _readyok_ string.
var positionCommand = {
    run: function (engineProcess, fen) {
        var self = this;
        var deferred = Q.defer();

        engineProcess.stdin.write('position fen ' + fen + endOfLine);
        isReadyCommand.run(engineProcess).then(function () {
            deferred.resolve();
        });
        return deferred.promise;
    }
};

//ucinewgame command
//------------------
//This command sends a _ucinewgame_ command to the UCI engine and returs a
//promise. After this command it also sends a _isready_ command and the promise
//is resolved when the UCI engine produces the _readyok_ string.
var uciNewGameCommand = {
    run: function (engineProcess) {
        var self = this;
        var deferred = Q.defer();

        engineProcess.stdin.write('ucinewgame' + endOfLine);
        isReadyCommand.run(engineProcess).then(function () {
            deferred.resolve();
        });
        return deferred.promise;
    }
};

//quit command
//------------
//This command sends a _quit_ command. It returns a promise which is resolved
//once the UCI engine process is terminated.
var quitCommand = {
    run: function (engineProcess) {
        var self = this;
        var deferred = Q.defer();

        var processCloseListener = function (code, signal) {
            engineProcess.removeListener('close', processCloseListener);
            deferred.resolve('Engine with process id ' + engineProcess.pid + ' shutdown successfully');
        };

        engineProcess.on('close', processCloseListener);
        engineProcess.stdin.write('quit' + endOfLine);
        return deferred.promise;
    }
};

function createGoCommandString(whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl) {
    if (!whiteMillisRemaining || !blackMillisRemaining) {
        throw "At least whiteMillisRemaining and blackMillisRemaining should be given";
    }

    whiteIncrementInMillis = whiteIncrementInMillis || '0';
    blackIncrementInMillis = blackIncrementInMillis || '0';
    if (noOfMovesToNextTimeControl) {
        noOfMovesToNextTimeControl = ' movestogo ' + noOfMovesToNextTimeControl;
    } else {
        noOfMovesToNextTimeControl = '';
    }

    return 'go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining + ' winc ' + whiteIncrementInMillis + ' binc ' + blackIncrementInMillis + noOfMovesToNextTimeControl;
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

//go command
//----------
//This command sends a _go wtime whiteTime btime blackTime winc whiteIncrement
//binc blackIncrement_ command and returns a promise. The promise is resolved
//when the UCI engine outputs a _bestmove_.
var timedGoCommand = {
    run: function (engineProcess, eventsEmitter, whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl) {
        var self = this;
        var deferred = Q.defer();

        var engineStdoutListener = function (data) {
            var lines = data.toString().split(endOfLineRegExp);
            for (var i = 0; i < lines.length; i++) {
                //TODO:Parse info and bestmove
                var stringifiedLine = S(lines[i]);
                if (stringifiedLine.startsWith('info')) {
                    eventsEmitter.emit('Info', lines[i]);
                } else if (stringifiedLine.startsWith('bestmove')) {
                    engineProcess.stdout.removeListener('data', engineStdoutListener);
                    var moveRegex = /bestmove (.*?) /g;
                    var match = moveRegex.exec(lines[i]);
                    if (match) {
                        deferred.resolve(convertToMoveObject(match[1]));
                    } else {
                        eventsEmitter.emit('Error', 'Invalid format of bestmove. Expected "bestmove <move>". Returned "' + lines[i] + '"');
                    }
                }
            }
        };

        engineProcess.stdout.on('data', engineStdoutListener);
        try {
            var commandString = createGoCommandString(whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl);
            engineProcess.stdin.write(commandString + endOfLine);
        }
        catch (e) {
            eventsEmitter.emit('Error', e);
        }
        return deferred.promise;
    }
};

//go infinite command
//-------------------
//The _go infinite_ command is special in that it is the only long running
//stoppable command. So in addition to the usual _run_ method the go command
//object has a second method named _stop_. The _run_ method sends the _go
//infinite_ command and returns a promise. This promise is resolved when the
//UCI engine produces a line starting with the string _info_.
var goInfiniteCommand = {
    run: function (engineProcess, eventsEmitter) {
        var self = this;
        var deferred = Q.defer();

        var engineStdoutListener = function (data) {
            var lines = data.toString().split(endOfLineRegExp);
            for (var i = 0; i < lines.length; i++) {
                //TODO:Parse info and bestmove
                var stringifiedLine = S(lines[i]);
                if (stringifiedLine.startsWith('info')) {
                    eventsEmitter.emit('Info', lines[i]);
                } else if (stringifiedLine.startsWith('bestmove')) {
                    engineProcess.stdout.removeListener('data', engineStdoutListener);
                    var moveRegex = /bestmove (.*?) /g;
                    var match = moveRegex.exec(lines[i]);
                    if (match) {
                        self.stopDeferred.resolve(convertToMoveObject(match[1]));
                    } else {
                        eventsEmitter.emit('Error', 'Invalid format of bestmove. Expected "bestmove <move>". Returned "' + lines[i] + '"');
                    }
                }
            }
        };

        engineProcess.stdout.on('data', engineStdoutListener);
        engineProcess.stdin.write('go infinite' + endOfLine);
        isReadyCommand.run(engineProcess).then(function () {
            deferred.resolve();
        });
        return deferred.promise;
    },

//The _stop_ method sends the stop command and returns a promise. This promise
//is resolved in the run method's stdout listener when it encounters a
//_bestmove_.
    stop: function (engineProcess) {
        var stopDeferred = Q.defer();
        this.stopDeferred = stopDeferred;
        engineProcess.stdin.write('stop' + endOfLine);
        return stopDeferred.promise;
    }
};

//start method
//------------
//Starts the UCI engine executable and raises the _EngineStarted_ event. If
//during this process an error is encountered, an _Error_ event is raised.
Engine.prototype.start = function () {
    var self = this;

    self.engineProcess = spawn(self.engineExecutablePath);

    self.engineProcess.on('close', function (code, signal) {
        if (code !== 0) {
            self.emit('Error', 'Engine with process id ' + self.engineProcess.pid + ' terminated abnormally with code ' + code);
            return;
        }
        if (signal !== null) {
            self.emit('Error', 'Engine with process id ' + self.engineProcess.pid + ' killed by signal ' + signal);
            return;
        }
    }).on('error', function (error) {
        self.emit('Error', error);
    });

    if (self.engineProcess.pid === 0) {
        self.emit('Error', 'Unable to start engine ' + self.engineExecutablePath);
        return;
    }

    //TODO:uciCommand should timeout to allow downstream modules to find out if
    //a command line program is a UCI engine or not.
    uciCommand.run(self.engineProcess).then(function (options) {
        self.emit('EngineStarted', options);
    }, function (error) {
        self.emit('Error', error);
    });
};

//stop method
//-----------
//Stops the UCI engine process which was running and raises the _EngineStopped_
//event. If during this process an error is encountered, an _Error_ event is
//raised.
Engine.prototype.stop = function () {
    var self = this;
    quitCommand.run(self.engineProcess).then(function (message) {
        self.emit('EngineStopped', message);
    }, function (error) {
        self.emit('Error', error);
    });
};

//startNewGame method
//-------------------
//Starts a new game and raises the _NewGameStarted_ event.  If during this
//process an error is encountered, an _Error_ event is raised.
Engine.prototype.startNewGame = function () {
    var self = this;
    uciNewGameCommand.run(self.engineProcess).then(function (message) {
        self.emit('NewGameStarted');
    }, function (error) {
        self.emit('Error', error);
    });
};

//analyzeUntilStopped method
//--------------------------
//Starts analyzing the given position and continues until the
//_stopAnalyzingAndFindBestMove_ method is called. Raises the _AnalysisStarted_
//event. If during this process an error is encountered, an _Error_ event is
//raised.
Engine.prototype.analyzeUntilStopped = function (position) {
    var self = this;

    return positionCommand.run(self.engineProcess, position).then(function (message) {
        return goInfiniteCommand.run(self.engineProcess, self).then(function () {
            self.emit('AnalysisStarted');
        });
    }, function (error) {
        self.emit('Error', error);
    });
};

//stopAnalysisAndFindBestMove method
//----------------------------------
//Stops analyzing the position and raises the _AnalysisStopped_ event. Raises
//the _BestMoveFound_ event as well. If during this process an error is
//encountered, an _Error_ event is raised.
Engine.prototype.stopAnalysisAndFindBestMove = function () {
    var self = this;
    goInfiniteCommand.stop(self.engineProcess).then(function (bestMove) {
        self.emit('AnalysisStopped');
        self.emit('BestMoveFound', bestMove);
    }, function (error) {
        self.emit('Error', error);
    });
};

//analyzeAndFindBestMove method
//-----------------------------
//Starts analyzing a given position and raises the _BestMoveFound_ event within
//the given time constraints.  If during this process an error is encountered,
//an _Error_ event is raised.
Engine.prototype.analyzeAndFindBestMove = function (position, whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl) {
    var self = this;
    return positionCommand.run(self.engineProcess, position).then(function (message) {
        return timedGoCommand.run(self.engineProcess, self, whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl).then(function (bestMove) {
            self.emit('BestMoveFound', bestMove);
        });
    }, function (error) {
        self.emit('Error', error);
    });
};

exports.Engine = Engine;
