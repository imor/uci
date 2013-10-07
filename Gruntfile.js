'use strict';

module.exports = function(grunt) {
    grunt.initConfig({
        jshint: {
            options: {
                node: true
            },
            all: ['Gruntfile.js', 'lib/*.js', 'examples/*.js']
        }
    });
    grunt.loadNpmTasks('grunt-contrib-jshint');
    grunt.registerTask('default', ['jshint']);
};
