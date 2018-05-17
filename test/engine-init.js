/**
 * Setup testing with `chai`.
 */

var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
chai.should();
var expect = chai.expect;



/**
 * Setup `child_process.spawn` mocks.
 */
var mockSpawn = require('mock-spawn');
var mySpawn = mockSpawn();
require('child_process').spawn = mySpawn;

// First spawn -> emit error, exit with status (1).
mySpawn.sequence.add(function (cb) {
    this.emit('error', new Error('spawn ' + badEnginePath + ' ENOENT'));
    setTimeout(function() { return cb(1); }, 10);
});
// Second spawn -> slow start of application. Simulate timeout error.
mySpawn.sequence.add(function (cb) {
    var self = this;

    setTimeout(function () {
        self.stdout.write('some output data');

        return cb(0);
    }, 1500);
});
// Third spawn -> normal application start.
mySpawn.sequence.add(function (cb) {
    var self = this;

    setTimeout(function () {
        self.stdout.write('some output data');

        return cb(0);
    }, 100);
});



/**
 * Some predefined constants to be used in tests.
 */

var badEnginePath = 'non_existent_engine';
var testEcecutableFile = 'test_executable';



/**
 * Our subject-under-test.
 */

var Engine = require('../src/main');



/**
 * Now the tests start :)
 */

describe('Engine', function () {
    describe('contructor', function () {
        it('throws when no engine path is provided', function () {
            return expect(function () {
                new Engine();
            }).to.throw('Path must be a string. Received undefined')
        });

        it('does not throw on bad engine path', function () {
            return expect(function () {
                new Engine('non_existent_engine');
            }).to.not.throw()
        });
    });

    describe('runProcess', function () {
        it('throws when tries to launch non existent path', function () {
            var engine = new Engine(badEnginePath);
            var promise = engine.runProcess();

            return promise.should.be.rejectedWith('spawn ' + badEnginePath + ' ENOENT');
        });

        it('throws timeout error if executable does not start within allowed timeout period', function () {
            var engine = new Engine(testEcecutableFile);
            var promise = engine.runProcess();

            return promise.should.be.rejectedWith('timeout while starting process');
        });

        it('does not throw if executable launched OK', function () {
            var engine = new Engine(testEcecutableFile);
            var promise = engine.runProcess();

            return promise.should.not.be.rejected;
        });
    });
});
