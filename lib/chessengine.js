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
var os = require('os');
var path = require('path');
var utilities = require('./utilities.js');

var Engine = function (engineExecutablePath) {
    this.engineExecutablePath = path.normalize(engineExecutablePath);
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
        var id = {};
        var nameRegExp = /id name\s+(.+)/;
        var authorRegExp = /id author\s+(.+)/;
        //TODO:parse options
        var engineStdoutListener = function (data) {
            var lines = data.toString().split(endOfLineRegExp);

            for (var i = 0; i < lines.length; i++) {
                if (lines[i] === 'uciok') {
                    engineProcess.stdout.removeListener('data', engineStdoutListener);
                    deferred.resolve( {id: id, options: options} );
                } else {
                    var stringifiedLine = S(lines[i]);
                    if (stringifiedLine.startsWith('option')) {
                        options.push(lines[i]);
                    } else if (stringifiedLine.startsWith('id')) {
                        var result = nameRegExp.exec(lines[i]);
                        if (result) {
                            id.name = result[1];
                        }
                        result = authorRegExp.exec(lines[i]);
                        if (result) {
                            id.author = result[1];
                        }
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

    return 'go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining;// + ' winc ' + whiteIncrementInMillis + ' binc ' + blackIncrementInMillis + noOfMovesToNextTimeControl;
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
                        deferred.resolve(utilities.convertToMoveObject(match[1]));
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
                        self.stopDeferred.resolve(utilities.convertToMoveObject(match[1]));
                    } else {
                        eventsEmitter.emit('Error', 'Invalid format of bestmove. Expected "bestmove <move>". Returned "' + lines[i] + '"');
                    }
                }
            }
        };

        engineProcess.stdout.on('data', engineStdoutListener);
        engineProcess.stdin.write('go infinite' + endOfLine);
        isReadyCommand.run(engineProcess).then(deferred.resolve);
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

//setoption command
//-----------------
//The _setoption_ command sends a _setoption name NAME value VALUE_ command to
//the UCI engine and returns a promise. After this command it also sends a
//_isready_ command and the promise is resolved when the UCI engine produces the
//_readyok_ string.
var setoptionCommand = {
    run: function (engineProcess, optionName, optionValue) {
        var self = this;
        var deferred = Q.defer();

        var command = 'setoption name ' + optionName + (optionValue? (' value ' + optionValue) : '') + endOfLine;
        engineProcess.stdin.write(command);
        isReadyCommand.run(engineProcess).then(deferred.resolve);
        return deferred.promise;
    }
};

//This function executes the executable and returns a promise which is resolved
//or rejected later depending upon whether the execution succeeded or failed.
function execute(executable) {
    var deferred = Q.defer();
    var engineProcess = spawn(executable);
    var timer;
    engineProcess.once('error', function (error) {
        clearInterval(timer);
        deferred.reject(error);
    });
    timer = setInterval(function () {
        if (utilities.isProcessRunning(engineProcess)) {
            clearInterval(timer);
            deferred.resolve(engineProcess);
        }

    }, 100);
    return deferred.promise;
}

//start method
//------------
//Starts the self.engineExecutablePath file, runs the uciCommand and returns
//a promise which is resolved or rejected depending upon whether the UCI engine
//started successfully or not.
Engine.prototype.start = function () {
    var self = this;
    return execute(self.engineExecutablePath).then(function (engineProcess) {
        //TODO:uciCommand should timeout to allow downstream modules to find out if
        //a command line program is a UCI engine or not.
        self.engineProcess = engineProcess;
        return uciCommand.run(engineProcess);
    }).then(function (idAndOptions) {
        self.engineProxy = {};
        self.engineProxy.name = idAndOptions.id.name;
        self.engineProxy.author = idAndOptions.id.author;
        self.engineProxy.availableOptions = idAndOptions.options;
        self.engineProxy.executablePath = self.engineExecutablePath;
        self.engineProxy.setOptions = {};
        self.engineProxy.setOption = function (optionName, optionValue) {
            self.engineProxy.setOptions[optionName] = optionValue;
        };
        return self;
    });
};

//stop method
//-----------
//Runs the quitCommand and returns the promise returned by running this command
Engine.prototype.stop = function () {
    var self = this;
    return quitCommand.run(self.engineProcess);
};

//startNewGame method
//-------------------
//Runs the uciNewGameCommand and returns the promize returned by running this
//command.
Engine.prototype.startNewGame = function () {
    var self = this;
    return uciNewGameCommand.run(self.engineProcess);
};

//analyzeUntilStopped method
//--------------------------
//Chains the positionCommand and goInfiniteCommand and returns the promise
//returned by the positionCommand.
Engine.prototype.analyzeUntilStopped = function (position) {
    var self = this;
    return positionCommand.run(self.engineProcess, position).then(function (message) {
        return goInfiniteCommand.run(self.engineProcess, self);
    });
};

//stopAnalysisAndFindBestMove method
//----------------------------------
//Runs the goInfiniteCommand and returns the promise returned by this command.
Engine.prototype.stopAnalysisAndFindBestMove = function () {
    var self = this;
    return goInfiniteCommand.stop(self.engineProcess);
};

//analyzeAndFindBestMove method
//-----------------------------
//Chains the positionCommand and timedGoCommand and returns the promize retunred
//by the position command.
Engine.prototype.analyzeAndFindBestMove = function (position, whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl) {
    var self = this;
    return positionCommand.run(self.engineProcess, position).then(function (message) {
        return timedGoCommand.run(self.engineProcess, self, whiteMillisRemaining, blackMillisRemaining, whiteIncrementInMillis, blackIncrementInMillis, noOfMovesToNextTimeControl);
    });
};

//setOption method
//----------------
//Runs the setoptionCommand and returns the promise returned by this command.
Engine.prototype.setOption = function (optionName, optionValue) {
    var self = this;
    return setoptionCommand.run(self.engineProcess, optionName, optionValue);
};

exports.Engine = Engine;
