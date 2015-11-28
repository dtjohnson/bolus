"use strict";

// TODO: Name setter func
// TODO: Handle circular resolve within resolver fn.

var glob = require("glob-all");
var path = require("path");

/**
 * Regex to strip comments from a function declaration.
 * @type {RegExp}
 * @private
 */
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;

/**
 * Regex to parse argument names from a function declaration (without comments).
 * @type {RegExp}
 * @private
 */
var ARGUMENT_NAMES = /([^\s,]+)/g;

/**
 * Initializes a new Injector.
 * @constructor
 * @example
 * var injector = new Injector();
 */
var Injector = function () {
    this._graph = {};
    this.registerValue("$injector", this);
};

/**
 * Register a module.
 * @param {string} name Name of the module.
 * @param {Function} fn A module function to register.
 * @example
 * injector.register("foo", function (dependencyA, dependencyB) {
 *     // Do something with dependencyA and dependencyB to initialize foo.
 *     // Return any object.
 * });
 */
Injector.prototype.register = function (name, fn) {
    var args = Injector._getArguments(fn);

    this._graph[name] = {
        factory: fn,
        dependencyNames: fn.$inject || args
    };
};

/**
 * Register a fixed value. (This is syntactic sugar for registering a function that simply returns the given value.)
 * @param {string} name The name of the module.
 * @param {*} value The value to register.
 * @example
 * // Register the value 5 with the name "foo".
 * injector.registerValue("foo", 5);
 * @example
 * // Register a function with the name "doubler".
 * injector.registerValue("doubler", function (arg) {
 *     return arg * 2;
 * });
 */
Injector.prototype.registerValue = function (name, value) {
    this.register(name, function () {
        return value;
    });
};

/**
 * Register module(s) with the given path pattern(s).
 * @param {string|Array.<string>} patterns The pattern or patterns to match. This uses the [glob-all]{@link https://github.com/jpillora/node-glob-all} module, which accepts negative patterns as well.
 * @param {Object} [globOptions] Options to pass to [glob-all]{@link https://github.com/jpillora/node-glob-all} and, in turn, [glob]{@link https://github.com/isaacs/node-glob}.
 * @example
 * // Register a single file.
 * injector.registerPath("path/to/module.js");
 * @example
 * // Register all JS files except spec files.
 * injector.registerPath(["**\/*.js", "!**\/*.spec.js"]);
 */
Injector.prototype.registerPath = function (patterns, globOptions) {
    globOptions = globOptions || {};
    globOptions.realpath = true;

    var files = glob.sync(patterns, globOptions);
    files.forEach(function (file) {
        var fn = require(file);
        if (typeof fn !== "function") return;

        var ext = path.extname(file);
        var basename = path.basename(file, ext);
        var name = fn.$name || basename;

        this.register(name, fn);
    }.bind(this));
};

/**
 * Requires modules and registers them with the name provided.
 * @param {Object.<string, string>} reqs Object with keys as injector names and values as module names to require.
 * @param {Module} [mod] The module to run [require]{@link https://nodejs.org/api/modules.html#modules_module_require_id} on. Defaults to the Injector module, which should typically behave correctly.
 * @example
 * injector.registerRequires({
 *     fs: "fs",
 *     Sequelize: "sequelize"
 * });
 * @returns {Injector} The injector (for chaining).
 */
Injector.prototype.registerRequires = function (reqs, mod) {
    mod = mod || module;
    for (var name in reqs) {
        if (reqs.hasOwnProperty(name)) {
            this.registerValue(name, mod.require(reqs[name]));
        }
    }

    return this;
};

/**
 * Resolve a module or multiple modules.
 * @param {string|Array.<string>} names Name or names to resolve.
 * @example
 * var log = injector.resolve("log");
 * @example
 * var resolved = injector.resolve(["fs", "log"]);
 * var fs = resolved[0];
 * var log = resolved[1];
 * @returns {*|Array.<*>} The resolved value(s).
*//**
 * Resolve a module or multiple modules.
 * @param {Function} fn Function to execute.
 * @param {Object.<string, *>} [locals] Local variables to inject into the function.
 * @example
 * // Resolve someNum and otherNum and set the result to the sum.
 * var result;
 * injector.resolve(function (someNum, otherNum) {
 *     result = someNum + otherNum;
 * });
 * @example
 * // This is essentially the same thing using a return in the function.
 * var result = injector.resolve(function (someNum, otherNum) {
 *     return someNum + otherNum;
 * });
 * @example
 * // You can also provide or override dependencies using the locals argument.
 * var result = injector.resolve(function (someNum, otherNum) {
 *     return someNum + otherNum;
 * }, { otherNum: 5 });
 * @returns {*} The result of the executed function.
 */
Injector.prototype.resolve = function () {
    var fn, names, locals, isArray;
    if (typeof arguments[0] === "function") {
        fn = arguments[0];
        locals = arguments[1];
        names = Injector._getArguments(fn);
    } else {
        names = arguments[0];
        isArray = Array.isArray(names);
        if (!isArray) names = [names];
    }

    var dependencies = names.map(function (dependencyName) {
        if (dependencyName[0] === '_' && dependencyName[dependencyName.length - 1] === '_') {
            dependencyName = dependencyName.substring(1, dependencyName.length - 1);
        }

        return (locals && locals[dependencyName]) || this._resolve(dependencyName, []);
    }.bind(this));

    if (fn) {
        return fn.apply(null, dependencies);
    } else {
        return isArray ? dependencies : dependencies[0];
    }
};

/**
 * Resolve a module with the given path.
 * @param {string} p The path to resolve.
 * @param {Object.<string, *>} [locals] Local variables to inject into the function.
 * @example
 * var log = injector.resolvePath("path/to/log.js");
 * @returns {*} The result of the executed function.
 */
Injector.prototype.resolvePath = function (p, locals) {
    var fn = require(path.join(process.cwd(), p));
    return this.resolve(fn, locals);
};

/**
 * Get a function's arguments.
 * @param {Function} fn Function to parse
 * @returns {Array.<string>} The parsed arguments.
 * @private
 */
Injector._getArguments = function (fn) {
    var fnStr = fn.toString().replace(STRIP_COMMENTS, '');
    return fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES) || [];
};

/**
 * Resolve a module.
 * @param name The name of the module to resolve.
 * @param previousNames Previous names that have been resolved in the chain. Used for detecting circular dependencies and reporting errors.
 * @returns {*}
 * @private
 */
Injector.prototype._resolve = function (name, previousNames) {
    var node = this._graph[name];
    if (!node) throw new Error("Dependency not found: " + previousNames.join(" -> ") + " -> " + name);

    if (!node.hasOwnProperty("value")) {
        var currentNames = previousNames.concat(name);
        if (previousNames.indexOf(name) >= 0) throw new Error("Circular dependency found: " + currentNames.join(" -> "));

        var dependencies = node.dependencyNames.map(function (dependencyName) {
            return this._resolve(dependencyName, currentNames);
        }.bind(this));

        node.value = node.factory.apply(null, dependencies);
    }

    return node.value;
};

// If this is being run inside of a Jasmine or Mocha test, add each Injector method to the global scope.
if ((global.jasmine || global.mocha)) {
    var injector;

    // Before each test, create a new Injector.
    (global.beforeEach || global.setup)(function () {
        injector = new Injector();
    });

    // After each test, throw the Injector away.
    (global.afterEach || global.teardown)(function () {
        injector = null;
    });

    // Add each prototype method that is not private to the global scope.
    for (var prop in Injector.prototype) {
        if (Injector.prototype.hasOwnProperty(prop) && prop[0] !== '_' && typeof Injector.prototype[prop] === "function") {
            var method = Injector.prototype[prop];
            global[prop] = (function (method) {
                return function () {
                    var args = arguments;

                    // We want this to be either before a test starts or during. So we register a function. If running
                    // beforehand, the injector won't yet be defined, so we just return the function to be called in a
                    // beforeEach. If the injector is defined, then the test is running, and we can just execute the
                    // function.
                    var workFn = function () {
                        return method.apply(injector, args);
                    };

                    return injector ? workFn() : workFn;
                };
            })(method);
        }
    }
}

module.exports = Injector;
