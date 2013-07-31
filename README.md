UCI
===

UCI is a thin wrapper on a
[uci interface](http://en.wikipedia.org/wiki/Universal_Chess_Interface)
chess engine. It also runs a chess clock and a
[chess.js](https://github.com/jhlywa/chess.js) instance internally so
that the user can quickly play a game of chess with time controls.
Currently [stockfish](http://stockfishchess.org/) is bundled with
UCI and though in principle other uci engines can be used neither
any other engine has been tested nor does UCI automatically
recognize new engines placed under the engines folder. You can hack
the main.js file in lib folder yourself for now if you want to use
another engine.

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
## API

### Events
UCI is an [EventEmitter](http://nodejs.org/api/events.html) and it
raises following events -

#### ready
This event is raised as soon as the engine process is running.

#### newgame
This event is raised once UCI has started a new game.

#### moved
This event is raised when the engine has made a move. The only
argument _move_ is an object with properties _from_, _to_ and
_promotion_. _from_ and _to_ are the algebraic notation square
names for the from square and to square respectively. _promotion_
property contains the piece to which the pawn is being promoted
otherwise it is null. E.g. following is a valid move object
```js
{from:'h7', to:'h8', promotion:'q'}
```

#### error
This event is raised when UCI detects an error. E.g. if the move
function is passed an invalid move object. The argument _message_
contains a string with details about the error.

#### exit
This event is raised when the UCI engine process terminates. The
argument _message_ contains a string with the reason for exiting.

#### gameends
This event is raised when the game ends either in a draw or with
one of the players (engine or the other player) winning. The two
arguments are _result_ which contains the result in a string
(e.g. '1-0', '1-1' or '0-1') and _reason_ which describes the
reason for the result. 

### Functions
UCI exposes following functions -

#### move
This function takes an argument _move_ and tries to move this on
the internal board. See the format of the _move_ object above.
If the move object is invalid in any way the event _error_ is raised.
```js
var move = {from:'h7', to:'h8', promotion:'q'};
uci.move(move);
```

#### startNewGame
This function starts a new game with the given arguments. The first
argument is the side which engine will play. It should be either 'b'
for black or 'w' for white. The second argument is the number of
minutes for which the game will be played. e.g. 
```js
uci.startNewGame('w', 10);
```

## Contributing
Fork, pick an issue to fix from [issues](https://github.com/imor/uci/issues)
and send a pull request.

## Credits
The excellent [chess.js](https://github.com/jhlywa/chess.js) library
by [Jeff Hlywa](https://github.com/jhlywa) and 
[Stockfish](http://stockfishchess.org/) the chess engine bundled with UCI.

## License
UCI is released under the MIT License. See the bundled LICENSE file for
details.
