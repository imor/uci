var events = require('events');
var util = require('util');
var Q = require('q');
var spawn = require('child_process').spawn;
var path = require('path');
var Chess = require('./chess.js').Chess;

var Engine = function() {
	var self = this;
	////TODO:Remove hardcoded executable name
	var engine = spawn(path.join(__dirname, '../engines/stockfish/stockfish-3-32-ja.exe'));

	engine.on('close', function (code) {
	});

	function checker(data, ok_response) {
		var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
		var arr = str.split(/\n/);
		for (var i = 0;i < arr.length;i++) {
			if (arr[i].replace('\r', '') == ok_response) {
				return true;
			}
		}
		return false;
	};

	function run_engine_command(commands, ok_response, result_checker) {
		result_checker = result_checker ? result_checker : checker;
		var deferred = Q.defer();
		var engine_stdout_listener = function(data) {
			var result = result_checker(data, ok_response);
			if (result) {
				clearTimeout(timerId);
				engine.stdout.removeListener('data', engine_stdout_listener);
				deferred.resolve(result);
			}
		};
		engine.stdout.on('data', engine_stdout_listener);
		for (var i = 0;i < commands.length;++i) {
			engine.stdin.write(commands[i] + '\n');
		}

		var timeout = 5000;
		var timerId = setTimeout(function() {
			engine.stdout.removeListener('data', engine_stdout_listener);
			deferred.reject(new Error("Didn't receive result within " + timeout + " millisecs"));
		}, timeout);
		return deferred.promise;
	}

	function delay(ms) {
		var deferred = Q.defer();
		setTimeout(deferred.resolve, ms);
		
		return deferred.promise;
	}

	run_engine_command(['uci'], 'uciok').then(function() {
	self.emit('ready');});

	function moveExtractor(data, ok_response) {
		var str = data.toString().replace('\r\n', '\n').replace('\r', '\n');
		var arr = str.split(/\n/);
		for (var i = 0;i < arr.length;i++) {
			var line = arr[i].replace('\r', '');
			if (line.substring(0, ok_response.length) === ok_response) {
				var moveRegex = /bestmove (.*?) /g;
				var match = moveRegex.exec(line);
				if (match) {
					return convertToMoveObject(match[1]);
				}
				else {
					throw new Error('Invalid format of bestmove. Expected "bestmove <move>". Returned "' + line +'"');
				}
			}
		}
		return false;
	}

	function convertToMoveObject(moveStr) {
		var result = {};
		result.from = moveStr.substring(0, 2);
		result.to = moveStr.substring(2, 4);
		if (moveStr.length > 4) {
			result.promotion = moveStr.substring(5);
		}
		return result;
	}

	self.move = function(move) {
		var validMove = self.chess.move(convertToMoveObject(move));
		if (validMove === null) {
			throw new Error('Invalid move ' + move);
		}
		run_engine_command(['position fen ' + self.chess.fen(), 'isready'], 'readyok').then(function() {
		return run_engine_command(createGoCommand(), 'bestmove', moveExtractor);}).then(function(move) {
			self.chess.move(move);
			self.emit('moved', move);});
	}

	function createGoCommand() {
		return ['go wtime ' + self.wMillisRemaining + ' btime ' + self.bMillisRemaining];
	}

	function updateRemainingTimes() {
		var now = new Date();
		var diff = now - self.lastTickTime;
		var prop = self.chess.turn() + 'MillisRemaining';
		self[prop] = self[prop] - diff;
		if (self[prop] <= 0.0) {
			clearInterval(self.clock);
			self.emit('timeUp', self.chess.turn());
			return;
		}
		self.lastTickTime = now;
	}

	self.startNewGame = function(engineSide, gameMinutes) {
		self.chess = new Chess();
		self.wMillisRemaining = self.bMillisRemaining = gameMinutes * 60 * 1000;
		run_engine_command(['ucinewgame', 'isready'], 'readyok').then(function() {
		return run_engine_command(['position startpos', 'isready'], 'readyok');}).then(function() {
			self.emit('newGameReady');
			self.lastTickTime = new Date();
			self.clock = setInterval(updateRemainingTimes, 1000);
			if (engineSide === 'w') {
				run_engine_command(createGoCommand(), 'bestmove', moveExtractor).then(function(move) {
				self.chess.move(move);
				self.emit('moved', move);});
			}
		});
	}
};
util.inherits(Engine, events.EventEmitter);
exports.Engine = Engine;