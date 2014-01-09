var fs = require('fs');
var path = require('path');
var isRunning = require('is-running');
var Q = require('q');
var Engine = require('./chessengine.js').Engine;

//Converts a move string to a move object. For the format of the move string and
//structure of the move object see
//[this](https://github.com/jhlywa/chess.js#movemove).
//@public
//@method  convertToMoveObject
//
//@param  {String}  move  The move string
//@return  {Object}  The move object
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

//Converts a move object to a move string. For the format of the move string and
//structure of the move object see
//[this](https://github.com/jhlywa/chess.js#movemove).
//@public
//@method  convertToMoveString
//
//@param  {Object}  move  The move object
//@return  {String}  The move string
function convertToMoveString(move) {
    if (!move || !move.from || !move.to) {
        return '';
    }

    return move.from + move.to + (move.promotion ? move.promotion : '');
}

//Recursively finds all files in a folder.
//@public
//@method  findAllFilesIn
//
//@param  {String}  folderToSearch  The folder where the search will be done.
//@return  {Array}  An array of absolute paths of all the files found in the
//searched folder.
function findAllFilesIn(folderToSearch) {
    var result = [];
    var files = fs.readdirSync(folderToSearch);
    for (var i = 0; i < files.length;i++) {
        var file = folderToSearch + path.sep + files[i];
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

//Determines the UCI engines among the given files.
//@public
//@method  findUciEnginesAmong
//
//@params  {Array}  files  An array of absolute paths of the candidate uci
//engines.
//@return  {Array}  A promise which is resolved when all the candidate uci
//engines are evaluated and actual UCI engines determined. This promise is
//resolved either with an array of engineProxy objects or an error "No engines
//found".
function findUciEnginesAmong(files) {
    var engineProxies = {};
    var startAndStopEnginePromises = [];

    function startAndStopEngine(engine) {
        return engine.start().then(function (engineObj) {
            engineProxies[engineObj.engineProxy.name] = engineObj.engineProxy;
            return engine.stop();
        });
    }

    for (var i = 0;i < files.length;i++) {
        var file = files[i];
        var engine = new Engine(file);
        startAndStopEnginePromises.push(startAndStopEngine(engine));
    }

    return Q.allSettled(startAndStopEnginePromises).then(function (results) {
        if (engineProxies.length === 0) {
            throw new Error('No engine found.');
        } else {
            return engineProxies;
        }
    });
}

//Takes a nodejs [ChildProcess](http://nodejs.org/api/child_process.html) and
//returns true if it is running.
//@public
//@method  isProcessRunning
//
//@param  {Object}  proc  A nodejs ChildProcess.
//@return  {Boolean}  true if the process is running, false otherwise.
function isProcessRunning(proc) {
    return isRunning(proc.pid) &&
    //This is a hack because the isRunning module incorrectly detects
    //non-running processes as running. See
    //[this issue](https://github.com/nisaacson/is-running/issues/4).
           proc.stdout._readableState.length !== 0;
}

exports.convertToMoveObject = convertToMoveObject;
exports.convertToMoveString = convertToMoveString;
exports.findAllFilesIn = findAllFilesIn;
exports.findUciEnginesAmong = findUciEnginesAmong;
exports.isProcessRunning = isProcessRunning;