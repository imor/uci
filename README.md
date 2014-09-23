UCI
===

NOTE:This version is not backwards compatible with 0.2.x series of releases.

UCI is a thin wrapper on a [uci
interface](http://en.wikipedia.org/wiki/Universal_Chess_Interface) chess engine.


## Installation
Make sure you have [node.js](http://nodejs.org/) installed. Then do:

    $ npm install uci

## Example
```js
var Engine = require('uci');
var engine = new Engine('<path to engine executable>');
engine.runProcess().then(function () {
    console.log('Started');
    return engine.uciCommand();
}).then(function (idAndOptions) {
    console.log('Engine name - ' + idAndOptions.id.name);
    return engine.isReadyCommand();
}).then(function () {
    console.log('Ready');
    return engine.uciNewGameCommand();
}).then(function () {
    console.log('New game started');
    return engine.positionCommand('startpos', 'e2e4 e7e5');
}).then(function () {
    console.log('Starting position set');
	console.log('Starting analysis');
    return engine.goInfiniteCommand(function infoHandler(info) {
        console.log(info);
    });
}).delay(2000).then(function () {
    console.log('Stopping analysis');
    return engine.stopCommand();
}).then(function (bestmove) {
    console.log('Bestmove: ');
    console.log(bestmove);
    return engine.quitCommand();
}).then(function () {
    console.log('Stopped');
}).fail(function (error) {
    console.log(error);
    process.exit();
}).done();
```
## API

See [here](http://imor.github.io/uci/docs/src/main.html) for API reference.

## Contributing
Fork, pick an issue to fix from [issues](https://github.com/imor/uci/issues) or
add a missing feature and send a pull request.

## License
UCI is released under the MIT License. See the bundled LICENSE file for details.
