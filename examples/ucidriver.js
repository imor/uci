var Engine = require('uci').Engine;
var uci = new Engine();

uci.on('ready', function () {
    console.log('Engine ready');
}).on('newgame', function () {
    var stdin = process.openStdin();
    stdin.on('data', function (move) {
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
        uci.move(convertToMoveObject(move.toString().replace('\r\n', '')));
    });
}).on('moved', function (move) {
    console.log('Engine moved ' + move.from + move.to +
		(move.promotion ? move.promotion : ''));
}).on('error', function (message) {
    console.log('Error:' + message);
}).on('exit', function (message) {
    console.log('Exiting:' + message);
}).on('gameends', function (result, reason) {
    console.log('Game ends with result ' + result + ' because ' + reason);
});

//Start a new 10 minute game with engine as black
uci.startNewGame('b', 10);
