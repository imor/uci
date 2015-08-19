var isRunning = require('is-running');
var endOfLine = require('os').EOL;
var endOfLineRegExp = new RegExp(endOfLine);

//Converts a move string to a move object. For the format of the move string and
//structure of the move object see
//[this](https://github.com/jhlywa/chess.js#movemove).
//@public
//@method  convertToMoveObject
//
//@param  {String}  move  The move string
//@return  {Object}  The move object
function convertToMoveObject(move) {
    if (typeof move === 'object') {
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
    if (typeof move === 'string') {
        return move;
    }
    if (!move || !move.from || !move.to) {
        return '';
    }

    return move.from + move.to + (move.promotion ? move.promotion : '');
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

//Takes a string and returns an object with two attributes - lines and
//incompleteLine. lines contains all the complete lines and incompleteLine
//contains any trailing characters without a newline character. E.g. string
//abc\ndef\nghi will return {lines:['abc','def'],incompleteLine:'ghi'}
//@public
//@method getLines
//
//@param {String} data String to parse
//@return {Object} lines object
function getLines(data) {
    var lines = data.split(endOfLineRegExp);
    if (data.lastIndexOf(endOfLine) < data.length - 1) {
        var incompleteLine = lines.pop();
        return {lines:lines, incompleteLine:incompleteLine};
    } else {
        return {lines:lines};
    }
}

exports.convertToMoveObject = convertToMoveObject;
exports.convertToMoveString = convertToMoveString;
exports.isProcessRunning = isProcessRunning;
exports.getLines = getLines;