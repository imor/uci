UCI
===

UCI is a thin wrapper on a
[uci interface](http://en.wikipedia.org/wiki/Universal_Chess_Interface)
chess engine. It also runs a chess clock internally so that the user
can quickly play a game of chess with time controls. Currently
[stockfish](http://stockfishchess.org/) is bundled with UCI and though
in principle other uci engines can be used neither any other engine
has been tested nor does UCI automatically recognize new engines
placed under the engines folder. You can hack the main.js file in lib
folder yourself for now if you want to use another engine.

## Installation
Make sure you have [node.js](http://nodejs.org/) installed.

    $npm install uci

## Example
```js
var Engine = require('uci').Engine;
var uci = new Engine();

uci.on('ready', function () {
    console.log('Engine ready');
}).on('newgame', function () {
    var stdin = process.openStdin();
    stdin.on('data', function (move) {
        uci.move(move.toString().replace('\r\n', ''));
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
```

## License

UCI is released under the MIT License. See the bundled LICENSE file for
details.
