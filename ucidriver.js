var Engine = require('./uci').Engine;

var uci = new Engine(2);
uci.on('ready', function() {
	console.log('Engine ready');
	uci.moved('e2e4');
}).on('moved', function (move) {
	console.log('Engine moved ' + move);
});