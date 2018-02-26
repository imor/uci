'use strict';

var events = require('events');
var util = require('util');
var spawn = require('child_process').spawn;
var Q = require('q');
var endOfLine = require('os').EOL;
var S = require('string');
var os = require('os');
var path = require('path');
var utilities = require('./utilities.js');

var Engine = function (engineFile) {
    this.engineFile = path.normalize(engineFile);
};

util.inherits(Engine, events.EventEmitter);

//This function starts the engine process and returns a promise which is
//resolved or rejected later depending upon whether the process is running or
//not
//@public
//@method  runProcess
Engine.prototype.runProcess = function () {
    var self = this;
    var deferred = Q.defer();
    this.engineProcess = spawn(this.engineFile);
    var timer;
    this.engineProcess.once('error', function (error) {
        clearInterval(timer);
        deferred.reject(error);
    });

    timer = setInterval(function () {
        if (utilities.isProcessRunning(self.engineProcess)) {
            clearInterval(timer);
            deferred.resolve();
        }

    }, 100);
    return deferred.promise;
};



//This function sends an _isready_ command. It returns a promise which is
//resolved once the engine responds with _readyok_.
//@public
//@method isReadyCommand
Engine.prototype.isReadyCommand = function () {
    var self = this;
    var deferred = Q.defer();
    var pendingData = "";

    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] === 'readyok') {
                self.engineProcess.stdout.removeListener('data', engineStdoutListener);
                deferred.resolve();
            }
        }
    };

    this.engineProcess.stdout.on('data', engineStdoutListener);
    this.engineProcess.stdin.write('isready' + endOfLine);
    return deferred.promise;
};

//This function sends a _uci_ command to the engine. It returns a promise which
//is resolved once the engine responds with _uciok_.
//@public
//@method uciCommand
Engine.prototype.uciCommand = function () {
    var self = this;
    var deferred = Q.defer();
    var pendingData = "";

    var options = [];
    var id = {};
    var nameRegExp = /id name\s+(.+)/;
    var authorRegExp = /id author\s+(.+)/;
    //TODO:parse options
    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            if (lines[i] === 'uciok') {
                self.engineProcess.stdout.removeListener('data', engineStdoutListener);
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

    this.engineProcess.stdout.on('data', engineStdoutListener);
    this.engineProcess.stdin.write('uci' + endOfLine);
    return deferred.promise;
};

//Commands without any output
//---------------------------
//Not all commands produce an output. Two examples are the _position_ and the
//_ucinewgame_ commands. For such commands how do you know if the engine is
//working on your command or has an infinite loop and is hung forever? You
//don't. As a workaround these commands send an _isready_ command at the end
//which fortunately produces the _readyok_ output.


//This function sends a _setoption name NAME value VALUE_ command to the engine
//and returns a promise. After this command it also sends a _isready_ command
//and the promise is resolved when the engine produces the _readyok_ string.
//@public
//@method setOptionCommand
//
//@param  {String}  optionName  The name of the option
//@param  {String}  optionValue The value of the option
Engine.prototype.setOptionCommand = function (optionName, optionValue) {
    //TODO:parse options from uci command and if option type is button, call the setoption on if optionValue is true
    var command = 'setoption name ' + optionName + (optionValue? (' value ' + optionValue) : '') + endOfLine;
    this.engineProcess.stdin.write(command);
    return this.isReadyCommand();
};

//This function sends a _ucinewgame_ command to the engine and returns a
//promise. After this command it also sends a _isready_ command and the promise
//is resolved when the engine produces the _readyok_ string.
//@public
//@method uciNewGameCommand
Engine.prototype.uciNewGameCommand = function () {
    this.engineProcess.stdin.write('ucinewgame' + endOfLine);
    return this.isReadyCommand();
};

//This function sends a _position fen FenString_ command and returns a promise.
//After this command it also sends a _isready_ command and the promise is
//resolved when the engine produces the _readyok_ string.
//@public
//@method positionCommand
//
//@param  {String}  fen  The fen string of the position or the value _startpos_.
//                       _startpos_ will set the starting position.
//@param  {String}  moves  The moves to play after the position with fen is set.
Engine.prototype.positionCommand = function (fen, moves) {
    this.engineProcess.stdin.write('position ');
    if (fen === 'startpos') {
        this.engineProcess.stdin.write('startpos');
    } else {
        this.engineProcess.stdin.write('fen ' + fen);
    }

    if (moves) {
      this.engineProcess.stdin.write(' moves ' + moves);
    }
    this.engineProcess.stdin.write(endOfLine);
    return this.isReadyCommand();
};

//This function sends a _go wtime whiteTime btime blackTime_ command and returns
//a promise. The promise is resolved when the engine outputs a _bestmove_.
//@public
//@method timeLimitedGoCommand
//
//@param  {Function}  infoHandler  A callback taking a string. This will be
//called for each info line output by the engine.
//@param  {Number}  whiteMillisRemaining  The remaining time for white in
//milliseconds
//@param  {Number}  blackMillisRemaining  The remaining time for black in
//milliseconds
Engine.prototype.timeLimitedGoCommand = function (infoHandler,
                                                  whiteMillisRemaining,
                                                  blackMillisRemaining) {
    var self = this;
    var deferred = Q.defer();
    var pendingData = "";
    
    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            //TODO:Parse info and bestmove
            var stringifiedLine = S(lines[i]);
            if (stringifiedLine.startsWith('info') && infoHandler) {
                infoHandler('info', lines[i]);
            } else if (stringifiedLine.startsWith('bestmove')) {
                self.engineProcess.stdout.removeListener('data', engineStdoutListener);
                var moveRegex = /bestmove (.*?) /g;
                var match = moveRegex.exec(lines[i]);
                if (match) {
                    deferred.resolve(utilities.convertToMoveObject(match[1]));
                } else {
                    throw new Error('Invalid format of bestmove. Expected "bestmove <move>". Returned "' + lines[i] + '"');
                }
            }
        }
    };

    this.engineProcess.stdout.on('data', engineStdoutListener);
    var commandString = 'go wtime ' + whiteMillisRemaining + ' btime ' + blackMillisRemaining;
    this.engineProcess.stdin.write(commandString + endOfLine);

    return deferred.promise;
};

//This function sends the _go_ command and returns a promise. After
//this command it also sends a _isready_ command and the promise is resolved
//when the engine produces the _readyok_ string.
//@public
//@method goCommand
//
//@param  {Object}    commands     Key-value pairs of commands that can follow
//the main _go_ command (e.g. _searchmoves_, _infinite_, etc.).
//@param  {Function}  infoHandler  A callback taking a string. This will be
//called for each info line output by the engine.
Engine.prototype.goCommand = function (commands, infoHandler) {
    var pendingData = "";
    
    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            //TODO:Parse info and bestmove
            var stringifiedLine = S(lines[i]);
            if (stringifiedLine.startsWith('info') && infoHandler) {
                infoHandler(lines[i]);
            }
        }
    };

    // create input command
    var inputCommand = 'go';
    if (commands === null) {
        inputCommand += endOfLine;
    } else {
        for (var command in commands) {
            if (commands.hasOwnProperty(command)) {
                inputCommand += ' ' + command;
                var value = commands[command];

                // e.g. { 'infinite': null, ... }
                if (value !== null && value !== '') {
                    inputCommand += ' ' + value;
                }
            }
        }
        inputCommand += endOfLine;
    }

    this.goInfiniteListener = engineStdoutListener;
    this.engineProcess.stdout.on('data', engineStdoutListener);
    this.engineProcess.stdin.write(inputCommand);
    return this.isReadyCommand();
};

//This function sends the _go infinite_ command and returns a promise. After
//this command it also sends a _isready_ command and the promise is resolved
//when the engine produces the _readyok_ string.
//@public
//@method goInfiniteCommand
//
//@param  {Function}  infoHandler  A callback taking a string. This will be
//called for each info line output by the engine.
Engine.prototype.goInfiniteCommand = function (infoHandler) {
    var pendingData = "";
    
    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            //TODO:Parse info and bestmove
            var stringifiedLine = S(lines[i]);
            if (stringifiedLine.startsWith('info') && infoHandler) {
                infoHandler(lines[i]);
            }
        }
    };

    this.goInfiniteListener = engineStdoutListener;
    this.engineProcess.stdout.on('data', engineStdoutListener);
    this.engineProcess.stdin.write('go infinite' + endOfLine);
    return this.isReadyCommand();
};

//This function sends the stop command and returns a promise. The promise is
//resolved when the engine outputs a _bestmove_.
//@public
//@method stopCommand
Engine.prototype.stopCommand = function () {
    var self = this;
    var deferred = Q.defer();
    var pendingData = "";
    
    var engineStdoutListener = function (data) {
        var lines = utilities.getLines(pendingData+data);
        pendingData = lines.incompleteLine ? lines.incompleteLine : "";
        lines = lines.lines;
        for (var i = 0; i < lines.length; i++) {
            //TODO:Parse info and bestmove
            var stringifiedLine = S(lines[i]);
            if (stringifiedLine.startsWith('bestmove')) {
                if (self.goInfiniteListener) {
                    self.engineProcess.stdout.removeListener('data', self.goInfiniteListener);
                }
                self.engineProcess.stdout.removeListener('data', engineStdoutListener);
                var moveRegex = /bestmove (.*?) /g;
                var match = moveRegex.exec(lines[i]);
                if (match) {
                    deferred.resolve(utilities.convertToMoveObject(match[1]));
                } else {
                    throw new Error('Invalid format of bestmove. Expected "bestmove <move>". Returned "' + lines[i] + '"');
                }
            }
        }
    };

    this.engineProcess.stdout.on('data', engineStdoutListener);
    this.engineProcess.stdin.write('stop' + endOfLine);
    return deferred.promise;
};

//This function sends a _quit_ command. It returns a promise which is resolved
//once the engine process is terminated.
//@public
//@method quitCommand
Engine.prototype.quitCommand = function () {
    var self = this;
    var deferred = Q.defer();

    var processCloseListener = function (code, signal) {
        self.engineProcess.removeListener('close', processCloseListener);
        deferred.resolve('Engine with process id ' + self.engineProcess.pid + ' shutdown successfully');
    };

    this.engineProcess.on('close', processCloseListener);
    this.engineProcess.stdin.write('quit' + endOfLine);
    return deferred.promise;
};

module.exports = Engine;
