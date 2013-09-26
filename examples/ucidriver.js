var UCI = require('uci').UCI;
var uci = new UCI();
var os = require('os');
var Chess = require('chess.js').Chess;
var game = new Chess();

console.log('Type exit or quit to exit.');
uci.on('ready', function () {
    //Use first opening book
    uci.setCurrentBook(uci.getAvailableBooks()[0]);
    //Start a new 10 minute game with engine as black
    uci.startNewGame(uci.getAvailableEngines()[0], 'black', 10);
}).on('newgame', function () {
    console.log("A new 10 minute game has started.");
    console.log("Enter your moves in algebraic notation. E.g. e2e4<Enter>");
    console.log(game.ascii());
    var stdin = process.openStdin();
    stdin.on('data', function (move) {
        if (move == 'exit' + os.EOL || move == 'quit' + os.EOL) {
            uci.shutdown();
            process.exit();
            return;
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
	move = convertToMoveObject(move.toString().replace(os.EOL, ''));
	game.move(move);
	console.log(game.ascii());
	console.log("Engine thinking...");
        uci.move(move);
    });
}).on('moved', function (move) {
    game.move(move);
    console.log(move.from + move.to + (move.promotion ? move.promotion : ''));
    console.log(game.ascii());
}).on('error', function (message) {
    console.log('Error:' + message);
}).on('exit', function (message) {
    console.log('Exiting:' + message);
}).on('gameends', function (result, reason) {
    console.log('Game ends with result ' + result + ' because ' + reason);
});
