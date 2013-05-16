var Engine = require('./uci').Engine;

var uci = new Engine();
uci.on('ready', function() {
	console.log('Engine ready');
}).on('newGameReady', function () {
	var stdin = process.openStdin();
	stdin.on('data', function(move) {
		uci.move(move.toString().replace('\r\n', ''));
	});
}).on('moved', function (move) {
	console.log('Engine moved ' + move.from + move.to)
}).on('timeUp', function(data) {
	console.log((data === 'w' ? "White's" : "Black's") + ' time is up');
});
uci.startNewGame('w', 3);
