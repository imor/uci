UCI
===

NOTE:This version is not backwards compatible with 0.1.x series of releases. This was kind of expected as this module is still very young.

UCI is a thin wrapper on a [uci
interface](http://en.wikipedia.org/wiki/Universal_Chess_Interface) chess engine.
It also runs a chess clock and a [chess.js](https://github.com/jhlywa/chess.js)
instance internally so that the user can quickly play a game of chess with time
controls. Currently only [stockfish](http://stockfishchess.org/) is bundled with
UCI but other engines can be used as well. See installing engines section below
for how to do that. UCI also supports polyglot books. See installing books
section for that.

## Installation
Make sure you have [node.js](http://nodejs.org/) installed. Then do:

    $ npm install uci
uci.startNewGame('path/to/engine-executable
## Example
```js
'use strict';

var UciEngine = require('uci');
var uci = new UciEngine();
var os = require('os');
var Chess = require('chess.js').Chess;
var game = new Chess();

console.log('Type exit or quit to exit.');
uci.on('Ready', function () {
    var availableEngines = uci.getAvailableEngines();
    for (var i = 0;i < availableEngines.length;i++) {
        var currentEngine = availableEngines[i];
        currentEngine.setOption('Skill Level', 1);
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
```
## API

### Events
UCI is an [EventEmitter](http://nodejs.org/api/events.html) and it raises
following events -

#### Ready
This event is raised once UCI has enumerated all the engines and books.

#### NewGameStarted
This event is raised once UCI has started a new game.

#### EngineMoved
This event is raised when the engine has made a move. The first argument _move_
is an object with properties _from_, _to_ and _promotion_. _from_ and _to_ are
the algebraic notation square names for the from square and to square
respectively. _promotion_ property contains the piece to which the pawn is being
promoted otherwise it is null. E.g. following is a valid move object
```js
{from:'h7', to:'h8', promotion:'q'}
```
The second argument is a boolean which is true if it is a book move and false
otherwise.

#### Error
This event is raised when UCI detects an error. E.g. if the move function is
passed an invalid move object. The argument _message_ contains a string with
details about the error.

#### GameEnded
This event is raised when the game ends either in a draw or with one of the
players (engine or the other player) winning. The two arguments are _result_
which contains the result in a string (e.g. '1-0', '1/2-1/2' or '0-1') and
_reason_ which describes the reason for the result.

### Functions
UCI exposes following functions -

#### move(move)
This function takes an argument _move_ and tries to move this on the internal
board. See the format of the _move_ object above.  If the move object is invalid
in any way the _error_ event is raised.
```js
var move = {from:'h7', to:'h8', promotion:'q'};
uci.move(move);
```

#### getAvailableEngines()
When a new uci instance is created it detects all the uci engines placed inside
the *uci/engines* directory. This function returns an array of these engine objects. See _Engine Object_ section below.

#### getAvailableBooks()
When a new uci instance is created it enumerates all the files in the
*uci/books* directory. This function returns a list of these books.

#### startNewGame(engine, engineSide, gameLength, [bookFile])
This function starts a new game. _engine_ is the path of the engine executable,
_engineSide_ is the side which the engine will play. It should be either 'white'
or 'black'. _gameLength_ is the game length in minutes. The optional bookFile is
the path to the polyglot book which the engine will use to lookup moves.
```js
uci.startNewGame('path/to/engine-executable', 'white', 10,
    'path/to/polyglot-book');
```

### Engine Object
Each object in the array of engine objects returned in getAvailableEngines() function is described here.

#### setOption function
This function takes a string optionName and a primitive optionValue. Options set using this function will be set on the UCI chess engine. For boolean options the optionValue should not be passed.

#### availableOptions property
This property contains an array of strings of the options available on the UCI engine.

## Installing engines
Place your own uci engines inside the *uci/engines* directory. UCI will detect
all the uci engines inside the engines directory by visiting all the files
recursively and trying to run them. The detected engines can be retrieved by calling the
*getAvailableEngines* function.

## Installing books
Place any polyglot format books under the *uci/books* directory. You can also
create sub directories within the books directory for better organization of
your books. UCI will treat all files found recursively under the *uci/books*
directory as polyglot books so only put valid books files there.

## Contributing
Fork, pick an issue to fix from [issues](https://github.com/imor/uci/issues) or
add a missing feature and send a pull request.

## Credits
The excellent [chess.js](https://github.com/jhlywa/chess.js) library by [Jeff
Hlywa](https://github.com/jhlywa) and [Stockfish](http://stockfishchess.org/)
the chess engine bundled with UCI.

## License
UCI is released under the MIT License. See the bundled LICENSE file for details.
