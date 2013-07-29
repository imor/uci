var Engine = require('uci').Engine;

var uci = new Engine();
uci.on('ready', function () {
    console.log('Engine ready');
}).on('newGameReady', function () {
    var stdin = process.openStdin();
    stdin.on('data', function (move) {
        uci.move(move.toString().replace('\r\n', ''));
    });
}).on('moved', function (move) {
    console.log('Engine moved ' + move.from + move.to);
}).on('error', function (message) {
    console.log(message);
}).on('exit', function (message) {
    console.log(message);
}).on('gameends', function (result, reason) {
    console.log('Game ends with result ' + result + ' because ' + reason);
});

uci.startNewGame('b', 1);
