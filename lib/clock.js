'use strict';
var events = require('events');
var util = require('util');

var Clock = function (gameTime) {
    this.lastTickTime = null;
    this.clock = null;
    this.turn = 'w';
    this.whiteMillisRemaining = gameTime * 60 * 1000;
    this.blackMillisRemaining = this.whiteMillisRemaining;
    this.started = false;
};

Clock.prototype.start = function () {
    var self = this;
    if (self.started) {
        throw "Clock is already started";
    }
    function updateRemainingTimes() {
        var now = new Date();
        var diff = now - self.lastTickTime;
        var millisToUpdate;
        if (self.turn === 'w') {
            millisToUpdate = self.whiteMillisRemaining = self.whiteMillisRemaining - diff;
        } else {
            millisToUpdate = self.blackMillisRemaining = self.blackMillisRemaining - diff;
        }
        if (millisToUpdate <= 0.0) {
            clearInterval(self.clock);
            self.emit('timeup', self.turn);
            return;
        }
        self.lastTickTime = now;
    }
    self.lastTickTime = new Date();
    self.clock = setInterval(updateRemainingTimes, 250);
    self.started = true;
};

Clock.prototype.stop = function () {
    clearInterval(this.clock);
    this.started = false;
};

Clock.prototype.getWhiteMillisRemaining = function () {
    return this.whiteMillisRemaining;
};

Clock.prototype.getBlackMillisRemaining = function () {
    return this.blackMillisRemaining;
};

Clock.prototype.playerMoved = function () {
    this.turn = this.turn === 'w' ? 'b' : 'w';
};

util.inherits(Clock, events.EventEmitter);
exports.Clock = Clock;
