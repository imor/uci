'use strict';

var events = require('events');
var util = require('util');
var S = require('string');

var ChessClock = function (timeControls) {
    var self = this;
    if (timeControls.length === 0) {
        throw 'There should be at least one time control';
    }
    for(var i = 0;i < timeControls.length; ++i) {
        if (!timeControls[i].noOfMoves && i < timeControls.length - 1) {
            throw 'Only the last time control can have the sudden death enabled.';
        }
    }

    self.timeControls = timeControls;
    self.turn = 'white';

    self.whiteClockData = {
        turnsPlayed:0,
        timeRemainingInMillis: self.timeControls[0].timeInMilliseconds,
        delayRemainingInMillis: self.timeControls[0].delayInMilliseconds,
        currentTimeControlIndex: 0
    };
    self.blackClockData = {
        turnsPlayed:0,
        timeRemainingInMillis: self.timeControls[0].timeInMilliseconds,
        delayRemainingInMillis: self.timeControls[0].delayInMilliseconds,
        currentTimeControlIndex: 0
    };

    self.currentClockData = self.whiteClockData;

    self.handleGrandClockTick = function () {
        var now = new Date();
        var diff = now - self.lastTick;
        self.lastTick = now;

        var millisToUpdate;
        self.currentClockData.delayRemainingInMillis = self.currentClockData.delayRemainingInMillis - diff;
        if (self.currentClockData.delayRemainingInMillis > 0.0) {
            return;
        } else {
            self.currentClockData.delayRemainingInMillis = 0.0;
            millisToUpdate = self.currentClockData.timeRemainingInMillis = self.currentClockData.timeRemainingInMillis - diff;
        }

        if (millisToUpdate <= 0.0) {
            clearInterval(self.grandClock);
            self.emit('TimeUp', self.turn);
            return;
        }
    };
};

function updateCurrentTimeControlIndex(self) {
    if (self.timeControls[self.currentClockData.currentTimeControlIndex] < self.timeControls.length - 1) {
        if (self.timeControls[self.currentClockData.currentTimeControlIndex].noOfMoves && self.currentClockData.turnsPlayed > self.timeControls[self.currentClockData.currentTimeControlIndex].noOfMoves) {
            self.currentClockData.currentTimeControlIndex++;

            self.currentClockData.timeRemainingInMillis += self.timeControls[self.currentClockData.currentTimeControlIndex].timeInMilliseconds;
            self.currentClockData.delayRemainingInMillis = self.timeControls[self.currentClockData.currentTimeControlIndex].delayInMilliseconds;
        }
    }
}

function playerMoved(self) {
    self.currentClockData.delayRemainingInMillis = self.timeControls[self.currentClockData.currentTimeControlIndex].delayInMilliseconds;
    self.currentClockData.timeRemainingInMillis = self.currentClockData.timeRemainingInMillis + self.timeControls[self.currentClockData.currentTimeControlIndex].incrementInMilliseconds;
    self.currentClockData.turnsPlayed++;
    updateCurrentTimeControlIndex(self);
}

function updateTurn(self) {
    if (self.turn === 'white') {
        self.turn = 'black';
        self.currentClockData = self.blackClockData;
    } else if (self.turn === 'black') {
        self.turn = 'white';
        self.currentClockData = self.whiteClockData;
    }
}

util.inherits(ChessClock, events.EventEmitter);

ChessClock.prototype.move = function() {
    playerMoved(this);
    updateTurn(this);
};

ChessClock.prototype.start = function () {
    this.lastTick = new Date();
    this.grandClock = setInterval(this.handleGrandClockTick, 250);
};

ChessClock.prototype.stop = function () {
    clearInterval(this.grandClock);
};

ChessClock.prototype.getClockData = function (side) {
    var self = this;
    if (self.turn === 'white') {
        return self.whiteClockData;
    } else if (self.turn === 'black') {
        return self.blackClockData;
    }
};

var TimeControl = function (timeInMilliseconds, incrementInMilliseconds, delayInMilliseconds, noOfMoves) {
    this.timeInMilliseconds = timeInMilliseconds || 0;
    this.incrementInMilliseconds = incrementInMilliseconds || 0;
    this.delayInMilliseconds = delayInMilliseconds || 0;
    this.noOfMoves = noOfMoves;
};

exports.ChessClock = ChessClock;
exports.TimeControl = TimeControl;