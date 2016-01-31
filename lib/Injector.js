"use strict";

// TODO: Handle circular resolve within resolver fn.

var glob = require("glob-all");
var path = require("path");

/**
 * Regex to strip comments from a function declaration.
 * @type {RegExp}
 * @private
 */
var STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/g;

/**
 * Regex to parse list of arguments from a function.
 * @type {RegExp}
 * @private
 */
var ARGUMENTS = /(?:\(([\s\S]*?)\)|([^)]*?)=>)/;

/**
 * Regex to parse argument names from a function declaration (without comments).
 * @type {RegExp}
 * @private
 */
var ARGUMENT_NAMES = /([^\s,]+)/g;

/**
 * Regex to determine if a function is a class.
 * @type {RegExp}
 * @private
 */
var IS_CLASS_REGEX = /^\s*class\s+/;

/**
 * Initializes a new Injector.
 * @constructor
 * @example
 * var injector = new Injector();
 */
var Injector = function () {
    // Initialize the dependency graph.
    this._graph = {};

    // Register the injector itself.
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
    // Use the dependencies in the $inject property or parse the arguments out of the function.
    var args = fn.$inject || Injector._getArguments(fn);

    // Add a node to the dependency graph.
    this._graph[name] = {
        factory: fn,
        dependencyNames: args
    };
};

/**
 * Register a fixed value.
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
    // Add a node to the dependency graph with the value already resolved.
    this._graph[name] = {
        value: value
    };
};

/**
 * A function that creates a name for a module registered by path.
 * @callback Injector~nameMakerCallback
 * @param {string} defaultName The default name to use. This is equal to the value of the function's $name property or the basename of the file.
 * @param {string} realpath The full path of the loaded module.
 * @param {Function} fn The actual module factory function.
 * @returns {string} The name to use (or falsy to use default).
 */

/**
 * Register module(s) with the given path pattern(s).
 * @param {string|Array.<string>} patterns The pattern or patterns to match. This uses the [glob-all]{@link https://github.com/jpillora/node-glob-all} module, which accepts negative patterns as well.
 * @param {Injector~nameMakerCallback} [nameMaker] A function that creates a name for a module registered by path.
 * @example
 * // Register a single file.
 * injector.registerPath("path/to/module.js");
 * @example
 * // Register all JS files except spec files.
 * injector.registerPath(["**\/*.js", "!**\/*.spec.js"]);
 * @example
 * injector.registerPath("path/to/module.js", function (defaultName, realpath, fn) {
 *     return defaultName.toUpperCase();
 * });
 */
Injector.prototype.registerPath = function (patterns, nameMaker) {
    // Get the files matching the patterns.
    var files = glob.sync(patterns, { realpath: true });

    // Register each file.
    files.forEach(function (file) {
        // Require the file to get the factory function. Skip if not a function.
        var fn = require(file);
        if (typeof fn !== "function") return;

        // Create the default name.
        var ext = path.extname(file);
        var basename = path.basename(file, ext);
        var defaultName = fn.$name || basename;

        // Call the nameMaker function if it exists. Otherwise, use the default name.
        var name = (nameMaker && nameMaker(defaultName, file, fn)) || defaultName;

        // Register the function.
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
 */
Injector.prototype.registerRequires = function (reqs, mod) {
    // Set the module for requiring to the passed in module or this one.
    mod = mod || module;

    // Require each req value and register with the req key.
    for (var name in reqs) {
        if (reqs.hasOwnProperty(name)) {
            this.registerValue(name, mod.require(reqs[name]));
        }
    }
};

/**
 * Resolve a module or multiple modules.
 * @param {string|Array.<string>} names Name or names to resolve.
 * @param {string} [context] Optional context to give for error messages.
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
 * @param {string} [context] Optional context to give for error messages.
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
    var fn, names, locals, isArray, context;

    // Parse out the two different ways of calling this overloaded method.
    if (typeof arguments[0] === "function") {
        // A function was passed in. Set the locals variable and parse the function arguments.
        fn = arguments[0];
        locals = arguments[1];
        context = arguments[2];
        names = Injector._getArguments(fn);
    } else {
        // A single name or an array of names was passed in.
        // In the former case, wrap as an array. We'll unwrap at the end.
        names = arguments[0];
        context = arguments[1];
        isArray = Array.isArray(names);
        if (!isArray) names = [names];
    }

    // Resolve each dependency.
    var previousNames = context ? [context] : [];
    var dependencies = names.map(function (name) {
        // If the name begins and ends with an underscore, strip it off.
        if (name[0] === '_' && name[name.length - 1] === '_') {
            name = name.substring(1, name.length - 1);
        }

        // Resolve the name using the locals object first, if available.
        return (locals && locals[name]) || this._resolve(name, previousNames);
    }.bind(this));

    if (fn) {
        // If called with a function, invoke the function with the resolved dependencies and return the result.
        return Injector._invokeFunction(fn, dependencies);
    } else {
        // Otherwise, return the resolved value(s).
        return isArray ? dependencies : dependencies[0];
    }
};

/**
 * Resolve a module with the given path.
 * @param {string} p The path to resolve.
 * @param {Object.<string, *>} [locals] Local variables to inject into the function.
 * @param {string} [context] Optional context to give for error messages. If omitted, path will be used.
 * @example
 * var log = injector.resolvePath("path/to/log.js");
 * @returns {*} The result of the executed function.
 */
Injector.prototype.resolvePath = function (p, locals, context) {
    // Load the function from the given path.
    var fn = require(path.join(process.cwd(), p));

    // Resolve the function and return the result.
    return this.resolve(fn, locals, context || p);
};

/**
 * Invoke a function or a class constructor.
 * @param {Function|Class} fn Function or class constructor to invoke.
 * @param {Array.<*>} [args] Arguments to invoke with.
 * @returns {*} The result of the invocation.
 * @private
 */
Injector._invokeFunction = function (fn, args) {
    var isClass = IS_CLASS_REGEX.test(fn.toString());
    if (isClass) {
        // Invoke the class constructor. Taken from here:
        // http://stackoverflow.com/a/33195176/1544622
        return new (Function.prototype.bind.apply(fn, [null].concat(args)))();
    } else if (fn) {
        // If called with a function, invoke the function with the resolved dependencies and return the result.
        return fn.apply(null, args);
    }
};

/**
 * Get a function's arguments.
 * @param {Function} fn Function to parse
 * @returns {Array.<string>} The parsed arguments.
 * @private
 */
Injector._getArguments = function (fn) {
    // Convert to string and get arguments.
    return this._getArgumentsFromString(fn.toString());
};

/**
 * Get a function's arguments given the string form. This is separated so we can test
 * arrow functions in older versions of Node.
 * @param {string} fnStr - A string version of a function.
 * @returns {Array.<string>} The parsed arguments.
 * @private
 */
Injector._getArgumentsFromString = function (fnStr) {
    // Strip any comments.
    fnStr = fnStr.replace(STRIP_COMMENTS, '');

    // Parse out the argument list.
    var match = fnStr.match(ARGUMENTS);
    if (!match) throw new Error("Unable to parse arguments from function string.");
    var argumentList = match[1] !== undefined ? match[1] : match[2];

    // Run the argument name regex on the argument list.
    return argumentList.match(ARGUMENT_NAMES) || [];
};

/**
 * Resolve a module.
 * @param name The name of the module to resolve.
 * @param previousNames Previous names that have been resolved in the chain. Used for detecting circular dependencies and reporting errors.
 * @returns {*}
 * @private
 */
Injector.prototype._resolve = function (name, previousNames) {
    // Get the node in the graph with the given name. Throw an error if not found.
    var node = this._graph[name];
    if (!node) throw new Error("Dependency not found: " + previousNames.join(" -> ") + " -> " + name);

    // If the value has not yet been resolved, resolve it.
    // We check if the property exists because the value can be falsy.
    if (!node.hasOwnProperty("value")) {
        // Check for a circular dependency.
        var currentNames = previousNames.concat(name);
        if (previousNames.indexOf(name) >= 0) throw new Error("Circular dependency found: " + currentNames.join(" -> "));

        // For each dependency, call this function recursively to resolve their dependencies.
        // Make sure to pass in the current dependency array so we can check for circular dependencies.
        var dependencies = node.dependencyNames.map(function (dependencyName) {
            return this._resolve(dependencyName, currentNames);
        }.bind(this));

        // Once we have the resolved dependencies, invoke the factory and save the value.
        node.value = Injector._invokeFunction(node.factory, dependencies);
    }

    // Return the resolved value.
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
