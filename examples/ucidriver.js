'use strict';

var UciEngine = require('uci');
var uci = new UciEngine();
var os = require('os');
var Chess = require('chess.js').Chess;
var game = new Chess();

console.log('Type exit or quit to exit.');
uci.on('Ready', function () {
    var availableEngines = uci.getAvailableEngines();
    for (var e in availableEngines) {
        var currentEngine = availableEngines[e];
        currentEngine.setOption('Skill Level', 20);
        uci.startNewGame(currentEngine, 'black', 10, uci.getAvailableBooks()[0]);
        break;
    }
}).on('NewGameStarted', function () {
    console.log("A new 10 minute game has started.");
    console.log("Enter your moves in algebraic notation. E.g. e2e4<Enter>");
    console.log(game.ascii());
    var stdin = process.openStdin();
    stdin.on('data', function (move) {
        if (move == 'exit' + os.EOL || move == 'quit' + os.EOL) {
            process.exit();
            return;
        }
        move = convertToMoveObject(move.toString().replace(os.EOL, ''));
        game.move(move);
        console.log(game.ascii());
        console.log("Engine thinking...");
        uci.move(move);
    });
}).on('EngineMoved', function (move, bookMove) {
    game.move(move);
    console.log('Engine moved ' + move.from + move.to + (move.promotion ? move.promotion : '') + '. BookMove:' + bookMove);
    console.log(game.ascii());
}).on('GameEnded', function (result, reason) {
    console.log('Game ended. Result: ' + result + '. Reason: ' + reason + '.');
    process.exit();
}).on('Error', function (error) {
    console.log('Error:' + error);
});

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