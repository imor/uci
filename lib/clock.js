var events = require('events');
var util = require('util');

var Clock = function (gameTime) {
    var self = this;
    var lastTickTime;
    var clock;
    var turn = 'w';
    var whiteMillisRemaining = gameTime * 60 * 1000;
    var blackMillisRemaining = whiteMillisRemaining;

    function updateRemainingTimes() {
        var now = new Date();
        var diff = now - lastTickTime;
        var millisToUpdate;
        if (turn === 'w') {
            millisToUpdate = whiteMillisRemaining = whiteMillisRemaining - diff;
        } else {
            millisToUpdate = blackMillisRemaining = blackMillisRemaining - diff;
        }
        if (millisToUpdate <= 0.0) {
            clearInterval(clock);
            self.emit('timeup', turn);
            return;
        }
        lastTickTime = now;
    }

    self.start = function () {
        lastTickTime = new Date();
        clock = setInterval(updateRemainingTimes, 250);
    }

    self.stop = function () {
        clearInterval(clock);
    }

    self.getWhiteMillisRemaining = function () {
        return whiteMillisRemaining;
    }

    self.getBlackMillisRemaining = function () {
        return blackMillisRemaining;
    }

    self.playerMoved = function () {
        turn = turn === 'w' ? 'b' : 'w';
    }
}
util.inherits(Clock, events.EventEmitter);
exports.Clock = Clock;
