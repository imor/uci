var Engine = require('./uci').Engine;

var uci = new Engine(2);
uci.on('ready', function() {
	console.log('Engine ready');
}).on('newGameReady', function () {
	var stdin = process.openStdin();
	stdin.on('data', function(move) {
		uci.move(move.toString().replace('\r\n', ''));
	});
}).on('moved', function (move) {
	console.log('Engine moved ' + move.from + move.to)
});
uci.startNewGame();
