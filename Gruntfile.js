'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        jshint: {
            options: {
                node: true
            },
            all: ['*.js', 'lib/*.js', 'examples/*.js', 'test/*.js']
        },
        cafemocha: {
            testThis: {
                src: 'test/**/*.js',
                options: {
                    ui: 'tdd',
                    reporter: 'spec'
                }
            }
        },
        groc: {
            javascript: [
                "lib/*.js"
            ],
            options: {
                "out": "docs/",
                "whitespace-after-token": false
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-cafe-mocha');
    grunt.loadNpmTasks('grunt-groc');

    grunt.registerTask('lint', ['jshint']);
    grunt.registerTask('test', ['cafemocha']);
    grunt.registerTask('doc', ['groc']);
    grunt.registerTask('default', ['test', 'lint', 'doc']);
};
