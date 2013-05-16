var Engine = require('./uci').Engine;

var lastTickTime;
var clock;
var turn = 'w';
var gameTime = 1;
var whiteMillisRemaining = gameTime * 60 * 1000;
var blackMillisRemaining = whiteMillisRemaining;

var uci = new Engine();
uci.on('ready', function() {
	console.log('Engine ready');
}).on('newGameReady', function () {
    lastTickTime = new Date();
    clock = setInterval(updateRemainingTimes, 250);
	var stdin = process.openStdin();
	stdin.on('data', function(move) {
        turn = turn === 'w' ? 'b' : 'w';
		uci.move(move.toString().replace('\r\n', ''), whiteMillisRemaining, blackMillisRemaining);
	});
}).on('moved', function (move) {
    turn = turn === 'w' ? 'b' : 'w';
	console.log('Engine moved ' + move.from + move.to);
});
uci.startNewGame('b', whiteMillisRemaining, blackMillisRemaining);

function updateRemainingTimes() {
    var now = new Date();
    var diff = now - lastTickTime;
	var millisToUpdate;
	if (turn === 'w') {
		millisToUpdate = whiteMillisRemaining = whiteMillisRemaining - diff;
		console.log('White remaing time ' + whiteMillisRemaining / 1000);
	}
	else {
		millisToUpdate = blackMillisRemaining = blackMillisRemaining - diff;
		console.log('Black remaing time ' + blackMillisRemaining / 1000);
	}
    if (millisToUpdate <= 0.0) {
        clearInterval(clock);
        console.log((turn === 'w' ? "White's" : "Black's") + ' time is up');
        return;
    }
    lastTickTime = now;
}