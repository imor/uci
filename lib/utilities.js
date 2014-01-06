var fs = require('fs');
var path = require('path');

//This function converts a string move to move object of the form
//{ from:'fromSquare', to:'toSquare', promotion:'promotionPiece' }
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

function convertToMoveString(move) {
    if (!move || !move.from || !move.to) {
        return '';
    }

    return move.from + move.to + (move.promotion ? move.promotion : '');
}

function findAllFilesIn (searchPath) {
    var result = [];
    var files = fs.readdirSync(searchPath);
    for (var i = 0; i < files.length;i++) {
        var file = searchPath + path.sep + files[i];
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

exports.convertToMoveObject = convertToMoveObject;
exports.convertToMoveString = convertToMoveString;
exports.findAllFilesIn = findAllFilesIn;