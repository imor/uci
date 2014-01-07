'use strict';

var os = require('os');
var spawn = require('child_process').spawn;
var path = require('path');

if (os.platform() === 'linux') {
    var command = spawn('chmod', ['+x', path.normalize(process.cwd() + '/engines/stockfish/stockfish-linux')]);
    command.on('error', function (error) {
        console.log(error);
    });
} else if (os.platform() === 'win32') {
    //Do nothing
} if (os.platform() === 'darwin') {
    //TODO:Test on Mac
}
