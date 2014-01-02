'use strict';

var os = require('os');
var spawn = require('child_process').spawn;
var path = require('path');

process.chdir(path.normalize(process.cwd() + '/engines/'));

if (os.platform() === 'linux') {
    var command = spawn('chmod', ['+x', path.normalize(__dirname + '/stockfish/stockfish-linux')]);
} else if (os.platform() === 'win32') {
    //Do nothing
} if (os.platform() === 'darwin') {
    //TODO:Test on Mac
}

command.on('error', function (error) {
        console.log(error);
});
