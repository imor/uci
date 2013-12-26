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
        docco: {
            docs: {
                src: ['lib/*.js'],
                options: {
                    output: 'docs/',
                    layout: 'classic'
                }
            }
        }
    });
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.loadNpmTasks('grunt-cafe-mocha');
    grunt.loadNpmTasks('grunt-docco');

    grunt.registerTask('lint', ['jshint']);
    grunt.registerTask('test', ['cafemocha']);
    grunt.registerTask('doc', ['docco']);
    grunt.registerTask('default', ['test', 'lint', 'doc']);
};
