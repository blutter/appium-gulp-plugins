"use strict";
var mocha = require('gulp-mocha'),
    Q = require('q'),
    // globby = Q.denodeify(require('globby')),
    globby = require('globby'),
    Transpiler = require('../index').Transpiler,
    jshint = require('gulp-jshint'),
    eslint = require('gulp-eslint'),
    vinylPaths = require('vinyl-paths'),
    del = require('del'),
    _ = require('lodash'),
    promisePipe = require("promisepipe"),
    AndroidEmulator = require('appium-ci').AndroidEmulator,
    androidTools = require('appium-ci').androidTools,
    iosTools = require('appium-ci').iosTools,
    spawn = require('child_process').spawn,
    exec = Q.denodeify(require('child_process').exec),
    path = require('path');

var DEFAULT_OPTS = {
  files: ["*.js", "lib/**/*.js", "test/**/*.js", "!gulpfile.js"],
  transpile: true,
  transpileOut: "build",
  babelOpts: {},
  linkBabelRuntime: true,
  jshint: true,
  watch: true,
  watchE2E: false,
  test: {
    files: ['${testDir}/**/*-specs.js', '!${testDir}/**/*-e2e-specs.js']
  },
  coverage: {
    files: ['./test/**/*-specs.js', '!./test/**/*-e2e-specs.js'],
    verbose: true
  },
  'coverage-e2e': {
    files: ['./test/**/*-e2e-specs.js'],
    verbose: true
  },
  e2eTest: {
    files: '${testDir}/**/*-e2e-specs.js',
    forceExit: process.env.TRAVIS || process.env.CI
  },
  testReporter: ( process.env.TRAVIS || process.env.CI ) ? 'spec' : 'nyan',
  testTimeout: 8000,
  buildName: null,
  extraPrepublishTasks: [],
  preCommitTasks: ['jshint', 'once']
};

var DEFAULT_ANDROID_E2ETEST_OPTS = {
  "android-emu": true,
  "android-avd": process.env.ANDROID_AVD || "NEXUS_S_18_X86"
};

// string interpolation
var interpolate = function (s, opts) {
  return _.keys(opts).reduce(function (s, k) {
    return s.replace(new RegExp('\\$\\{\\s*' + k + '\\s*\\}', 'g'), opts[k]);
  }, s);
};

var boilerplate = function (gulp, opts) {
  var spawnWatcher = require('../index').spawnWatcher.use(gulp);
  var runSequence = Q.denodeify(require('run-sequence').use(gulp));
  opts = _.cloneDeep(opts);
  _.defaults(opts, DEFAULT_OPTS);

  // re-defaulting when e2eTest.android=true
  if (opts.e2eTest.android) {
    _.defaults(opts.e2eTest, DEFAULT_OPTS.e2eTest);
    _.defaults(opts.e2eTest, DEFAULT_ANDROID_E2ETEST_OPTS);
  }
  // re-defaulting when e2eTest.ios=true
  if (opts.e2eTest.ios) {
    _.defaults(opts.e2eTest, DEFAULT_OPTS.e2eTest);
  }
  process.env.APPIUM_NOTIF_BUILD_NAME = opts.buildName;

  gulp.task('clean', function () {
    if (opts.transpile) {
      return gulp.src(opts.transpileOut, {read: false})
                 .pipe(vinylPaths(del));
    }
  });

  var testDeps = [];
  var testTasks = [];
  var rootDir = '.';
  if (opts.transpile) {
    testDeps.push('transpile');
    rootDir = opts.transpileOut;
  }
  var fileAliases = {rootDir, testDir: `${rootDir}/test`, libDir: `${rootDir}/lib`};

  if (opts.test) {
    var testFiles = _.flatten([opts.test.files || opts.testFiles]).map(function (f) {
      return interpolate(f, fileAliases);
    });
    gulp.task('unit-test', testDeps, function () {
      var isForceLogMode = parseInt(process.env._FORCE_LOGS, 10) === 1;
      var mochaOpts = {
        reporter: isForceLogMode ? 'spec' : opts.testReporter,
        timeout: opts.testTimeout,
        'require': opts.testRequire || []
      };
      // set env so our code knows when it's being run in a test env
      process.env._TESTING = 1;
      return gulp
       .src(testFiles, {read: false})
       .pipe(mocha(mochaOpts))
       .on('error', spawnWatcher.handleError);
    });
    testTasks.push('unit-test');
  }

  var doCoverage = function (taskName, filePatterns, targetDir) {
    var covTestFiles = _.flatten([filePatterns]).map(function (f) {
      return interpolate(f, fileAliases);
    });
    console.log(`doCoverage => ${covTestFiles}`);
    gulp.task(taskName, function () {
      exec('pwd');
      return exec('rm -rf ./build').then(function () {
        console.log(`doCoverage task: covTestFiles ${covTestFiles}`);
        return globby(covTestFiles).then(function (files) {
        // return globby(['*']).then(function (files) {
          console.log(__dirname);
          console.log(files);
          console.log(`main ${require.main.filename}`);
          console.log(`\nisparta: ${require.resolve("isparta")}`);
          console.log(`\nmocha: ${require.resolve("mocha")}`);
          console.log(`\nbabel: ${require.resolve("babel")}`);
          // console.log(`\nbabel: ${require.resolve("babelhook")}`);
          console.log(`\nappium gulp plugins: ${require.resolve("appium-gulp-plugins")}`);

          var appiumGulpPath = path.join(require.resolve("appium-gulp-plugins"), "..");
          console.log(`\nappiumGulpPath ${appiumGulpPath}`);
          var babelHookPath = path.join(appiumGulpPath, "babelhook");

          var babelPath = path.normalize(require.resolve("babel"));
          console.log(`\n0. ${globby.sync(babelPath, ["**/node_modules"])}`);
          // strip first node_modules.*
          var topLevelNodeModulesSubStr = babelPath.match(new RegExp(/(.*?)(node_modules)/gi));
          var topLevelNodeModulesPath = topLevelNodeModulesSubStr[0];
          console.log(`\n1. ${topLevelNodeModulesSubStr} - ${topLevelNodeModulesPath}`);
          console.log(`\n2. ${path.join(topLevelNodeModulesPath, "/*/babel-node")}`);
          console.log(`\n2. ${globby.sync(path.join(topLevelNodeModulesPath, "/.bin/babel-node"))}`);
          //console.log(`\n3. ${globby.sync(path.join(topLevelNodeModulesPath, "**/bin/isparta"))}`);
          let ispartaPath = require.resolve("isparta");
          console.log(`\n4: ${globby.sync(path.join(ispartaPath, "../.."), "bin/isparta")}`);
          let ispartaBinPath = path.join(ispartaPath, "../../bin/isparta");
          console.log(`\n5. ${ispartaBinPath}`);

          var myBin = {};
          _.each(['isparta', 'babel-node', '_mocha'], k => {
             var binPath = globby.sync(path.join(topLevelNodeModulesPath, `/.bin/${k}`))[0]; 
             console.log(binPath);
             myBin[k] = path.normalize(binPath);
            });
          
          console.log(`\nmyBins = ${JSON.stringify(myBin)}`);

          console.log(`\n2. ${globby.sync(path.join(topLevelNodeModulesPath, "/*/babel-node"))}`);
          //console.log(`\n${babelPath.replace(/\(.*node_modules\)`))}`);
          var deferred = Q.defer();
          var bins = {};
          _.each(['isparta', 'babel-node', '_mocha'], function (k) { bins[k] = path.resolve(__dirname, '../node_modules/.bin', k); });
          var bin = myBin['babel-node'];
          // var args = [bins.isparta, 'cover', '--dir', targetDir, bins._mocha, '--', '--require', __dirname + '/../babelhook', '--reporter', 'dot']
          //   .concat(files);

          var normalizeFiles = files.map(f => path.normalize(f));
          console.log(normalizeFiles);
          var args = [ispartaBinPath, 'cover', '--dir', targetDir, myBin._mocha, '--', '--require', babelHookPath, '--reporter', 'dot']
            .concat(normalizeFiles);
          var env = _.clone(process.env);
          env.NO_PRECOMPILE=1;
          env._TESTING=1;
          console.log("running command -->", bin, args.join(' ')); // eslint-disable-line no-console
          var proc = spawn(bin, args, {stdio: opts.coverage.verbose ? 'inherit' : 'ignore', shell: true, env});
          proc.on('close', function (code) {
            if (code === 0) {
              deferred.resolve();
            } else {
              deferred.reject(new Error('Coverage command exit code: ' + code));
            }
          });
          return deferred.promise;
        }, err => {
          console.log(`Error: ${err}`);
        });
      }).catch(spawnWatcher.handleError);
    });
  };
  console.log("Running coverage...");
  if (opts.coverage) {
    console.log("Running coverage");
    globby(['*']).then(f => console.log(`file ${f}`));
    doCoverage('coverage', opts.coverage.files, 'coverage');//.then( () => console.log(`coverage done!`));
    //console.log(`res: ${res}`);
    gulp.task('coveralls', ['coverage'], function () {
      console.log("running coveralls");
      var bin = path.resolve(__dirname, '../node_modules/.bin/coveralls');
      return exec('cat ./coverage/lcov.info | ' + bin).catch(spawnWatcher.handleError);
    });
  }
  if (opts['coverage-e2e']) {
    doCoverage('coverage-e2e', opts['coverage-e2e'].files, 'coverage-e2e');
  }
  if (opts.e2eTest) {
    var e2eTestFiles = _.flatten([opts.e2eTest.files || opts.e2eTestFiles]).map(function (f) {
      return interpolate(f, fileAliases);
    });
    gulp.task('e2e-test', testDeps,  function () {
      var isForceLogMode = parseInt(process.env._FORCE_LOGS, 10) === 1;
      var mochaOpts = {
        reporter: isForceLogMode ? 'spec' : opts.testReporter,
        timeout: opts.testTimeout
      };
      // set env so our code knows when it's being run in a test env
      process.env._TESTING = 1;
      var seq = [
        function () {
          return promisePipe(gulp
           .src(e2eTestFiles, {read: false})
           .pipe(mocha(mochaOpts)));
        }];
      var cleanupSeq = [];
      var cleanupWarn = function (err) { console.warn('Error during cleanup, ignoring:', err); }; // eslint-disable-line no-console
      if (opts.e2eTest.android) {
        if (opts.e2eTest["android-emu"]) {
          var emu = new AndroidEmulator(opts.e2eTest['android-avd']);
          seq = [
            function () { return androidTools.killAll(); },
            function () { return new Q(emu.start()); },
            function () { return emu.waitTillReady();}
          ].concat(seq);
          cleanupSeq = cleanupSeq.concat([
            function () { return emu.stop(); },
            function () { return androidTools.killAll().catch(cleanupWarn); }
          ]);
        } else {
          seq = [
            function () { return androidTools.killAll(); },
          ].concat(seq);
          cleanupSeq = cleanupSeq.concat([
            function () { return androidTools.killAll().catch(cleanupWarn); }
          ]);
        }
      }
      if (opts.e2eTest.ios) {
        var xCodeVersion = opts.e2eTest.xCodeVersion || '6.1.1';
        seq = [
          function () { return iosTools.killAll(); },
          function () { return iosTools.configureXcode(xCodeVersion); },
          function () { return iosTools.resetSims(); },
        ].concat(seq);
        cleanupSeq = cleanupSeq.concat([
          function () { return iosTools.killAll().catch(cleanupWarn); }
        ]);
      }
      return seq.reduce(Q.when, new Q())
        .then(function () {
          return cleanupSeq.reduce(Q.when, new Q()).fin(function () {
            if (opts.e2eTest.forceExit) {
              process.exit(0);
            }
          });
        }).catch(function (err) {
          return cleanupSeq.reduce(Q.when, new Q()).fin(function () {
            spawnWatcher.handleError(err);
            if (opts.e2eTest.forceExit) {
              process.exit(1);
            }
          });
        });
    });
    testTasks.push('e2e-test');
  }

  if (testTasks.length > 0) {
    gulp.task('test', function () {
      return runSequence.apply(null, testTasks);
    });
  }

  if (opts.transpile) {
    gulp.task('transpile', function () {
      var transpiler = new Transpiler(opts);
      return gulp.src(opts.files, {base: './'})
        .pipe(transpiler.stream())
        .on('error', spawnWatcher.handleError)
        .pipe(gulp.dest(opts.transpileOut));
    });

    gulp.task('prepublish', function () {
      var tasks = ['clean', 'transpile'].concat(opts.extraPrepublishTasks);
      return runSequence.apply(this, tasks);
    });
  }

  var lintTasks = [];

  gulp.task('eslint', function () {
    return gulp.src(['**/*.js', '!node_modules/**', '!build/**'])
      .pipe(eslint())
      .pipe(eslint.format())
      .pipe(eslint.failAfterError());
  });

  if (opts.jshint) {
    gulp.task('jshint', function () {
      return gulp
       .src(opts.files)
       .pipe(jshint())
       .pipe(jshint.reporter('jshint-stylish'))
       .pipe(jshint.reporter('fail'))
       .on('error', spawnWatcher.handleError);
    });
    lintTasks.push('jshint');
  }

  if (opts.jshint) {
    opts.lint = true;
    gulp.task('lint', lintTasks);
  }

  var defaultSequence = [];
  if (opts.transpile) defaultSequence.push('clean');
  if (opts.lint) defaultSequence.push('lint');
  if (opts.transpile && !opts.test) defaultSequence.push('transpile');
  if (opts.postTranspile) defaultSequence = defaultSequence.concat(opts.postTranspile);
  if (opts.test) {
    if (opts.watchE2E) {
      defaultSequence.push('test');
    } else if (_.includes(testTasks, 'unit-test')) {
      defaultSequence.push('unit-test');
    }
  }
  if (opts.extraDefaultTasks) defaultSequence = defaultSequence.concat(opts.extraDefaultTasks);

  if (opts.watch) {
    spawnWatcher.clear(false);
    spawnWatcher.configure('watch', opts.files, function () {
      return runSequence.apply(null, defaultSequence);
    });
  }

  gulp.task('once', function () {
    return runSequence.apply(null, defaultSequence);
  });

  gulp.task('default', [opts.watch ? 'watch' : 'once']);

  if (opts.preCommitTasks) {
    // this is a magic task that gets picked up by `git-guppy`
    // and automatically added as a pre-commit git hook
    gulp.task('pre-commit', opts.preCommitTasks);
  }

  console.log("Leaving now!");
};


module.exports = {
  DEFAULTS: _.cloneDeep(DEFAULT_OPTS),
  use (gulp) {
    return function (opts) {
      boilerplate(gulp, opts);
    };
  }
};
