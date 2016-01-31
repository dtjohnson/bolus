[![view on npm](http://img.shields.io/npm/v/bolus.svg)](https://www.npmjs.org/package/bolus)
[![npm module downloads per month](http://img.shields.io/npm/dm/bolus.svg)](https://www.npmjs.org/package/bolus)
[![Build Status](https://travis-ci.org/dtjohnson/bolus.svg?branch=master)](https://travis-ci.org/dtjohnson/bolus)

# bolus
Simple dependency injection module for [Node.js](https://nodejs.org) with inspiration from [AngularJS](https://angularjs.org/).

## Installation

    $ npm install bolus

## Examples

Examples can be found in a separate GitHub repository: [bolus-examples](https://github.com/dtjohnson/bolus-examples).

## Usage
The basic idea behind bolus is to register factory functions with an injector and then resolve them later. Each factory function takes its dependencies as arguments and then returns any value. Here is a basic example: 
```js
// index.js
// Import the module.
var Injector = require("bolus");

// Create a new injector.
var injector = new Injector();

// Register a module named 'a' that returns the value 5 when resolved.
injector.register("a", function () {
    return 5;
});

// Now register a module named 'b' that depends on 'a'.
injector.register("b", function (a) {
    return a + 7;
});

// Now resolve 'b'.
var b = injector.resolve("b");
console.log(b); // prints 12
```

A more typical use case is when the modules 'a' and 'b' are in separate files. Let's move the factory functions into their own files:
```js
// a.js
module.exports = function () {
    return 5;
};
```
```js
// b.js
module.exports = function (a) {
    return a + 7;
};
```
Now our main code can be written simply as:
```js
// index.js
// Import the module.
var Injector = require("bolus");

// Create a new injector.
var injector = new Injector();

// Register all JS files as modules.
injector.registerPath("**/*.js");

// Now resolve 'b'.
var b = injector.resolve("b");
console.log(b); // prints 12
```

By default, the [registerPath](#Injector+registerPath) method uses the basename of the files (in this case 'a' and 'b') as the registered name. (This can be overridden by specifying a [nameMakerCallback](#Injector..nameMakerCallback).) As you can see, bolus tries to be [DRY](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself) by using the file name as the registered module name and the named factory arguments as the dependency names. If you wish, you can also specify these explicitly:
```js
module.exports = function (foo, bar) {
    return foo + bar;
};

module.exports.$name = "some name";
module.exports.$inject = ["some dependency", "some other dependency"];
```

### External Dependencies
When using bolus, you can (and should) register any external dependencies (including core Node.js modules) with the injector as well. This ensures consistency and eases testing. You do this by passing an object to the [registerRequires](#Injector+registerRequires) method.
```js
var Injector = require("bolus");
var injector = new Injector();

injector.registerRequires({
    fs: "fs",
    Sequelize: "sequelize"
});
```
The keys are names that will be registered with the injector, the values are the names of the modules that will be passed to Node's require. These can then be injected into a module in the usual way.
```js
module.exports = function (a, fs, Sequelize) {
    ...
};
```

### Unit Testing
One of the best features of dependency injection is the simplicity of testing. Rather than load the entire application, you can load just the code of interest in isolation and test it with controlled inputs. Here's how a Jasmine test of the 'a' module could look:
```js
// a.spec.js
var Injector = require("bolus");

describe("a", function () {
    it("should return 5", function () {
        var injector = new Injector();
        injector.registerPath("app/a.js");
        var a = injector.resolve("a");
        expect(a).toBe(5);
    });
});
```
The idea is that you create a new, clean injector for every test, inject your module of interest and any dependencies, and then run your test.
 
If you use [Jasmine](http://jasmine.github.io/) or [Mocha](https://mochajs.org/), bolus will handle the lifecycle of the injector for you. Simply requiring bolus will add all of the injector methods on the global scope. Each of these methods apply only to the injector for the current test. So the test for 'a' would become:
```js
// a.spec.js
require("bolus");

describe("a", function () {
    it("should return 5", function () {
        registerPath("app/a.js");
        var a = resolve("a");
        expect(a).toBe(5);
    });
});
```

If you have multiple tests with the same setup, you might prefer to use a Jasmine beforeEach:
```js
// a.spec.js
require("bolus");

describe("a", function () {
    var a;
    beforeEach(function () {
        registerPath("app/a.js");
        a = resolve("a");
    });
    
    it("should return 5", function () {
        expect(a).toBe(5);
    });
});
```

You can also easily provide mocks for dependencies to simplify your testing. Here's what a Jasmine test for 'b' could look like:
```js
// b.spec.js
require("bolus");

describe("b", function () {
    beforeEach(registerPath("app/b.js"));

    it("should return 10 when a is 3", function () {
        registerValue("a", 3);
        var b = resolve("b");
        expect(b).toBe(10);
    });

    it("should return 1 when a is -6", function () {
        registerValue("a", -6);
        var b = resolve("b");
        expect(b).toBe(1);
    });
});
```
Here, we have provided two different values for the dependency 'a'. Also, note the alternative form of the beforeEach injector usage.

### Advanced Usage
The above usage should be enough for most use cases. However, there are some more advanced features available if needed.

#### Using Classes
If you are using v4 or higher of Node.js, you can also create class module. This work similar to the functions but the dependencies are passed to the class constructor.
```js
class SomeClass {
    constructor(a) {
        this._a = a;
    }

    someMethod() {
        console.log(this._a);
    }
}

module.exports = SomeClass;
```

#### Advanced Resolving
In addition to resolving a single module with the [resolve](#Injector+resolve) method, you can also resolve more that one at a time.
```js
var modules = injector.resolve(["a", "b"]);
```
Here, modules is an array whose values are the resolved modules corresponding to the given names.

Additionally, you can pass a function to [resolve](#Injector+resolve) that will be invoked with the arguments resolved:
```js
var result = injector.resolve(function (a, b) {
    return a - b;
});
```
Notice that the return value of the function is passed through. This function usage, along with underscore notation, is very helpful in unit tests:
```js
describe("some test", function () {
    var something;
    
    // An underscore prefix and suffix is used to not hide the 'something' variable.
    // The injector will ignore the underscores.
    beforeEach(resolve(function (_something_) {
        something = _something_;
    });
    
    it("should do something", function () {
        // run tests on 'something' 
    });
});
```

You can resolve a function like this in a file in one call:
```js
var result = injector.resolvePath("path/to/some/file.js");
```

When resolving with a function, you can also pass along a 'locals' object that includes variables to provide or override dependencies.
```js
injector.resolvePath("path/to/some/file.js", {
    someKey: "someValue"
});
```
(This is used in the Express example [here](https://github.com/dtjohnson/bolus-examples/blob/master/express/app/server.js) to pass along a different router for each route file.) 

#### Accessing the Injector Within a Module
The injector itself is registered in the injector as '$injector' to allow for some more advanced usages. (See [here](https://github.com/dtjohnson/bolus-examples/blob/master/express/app/db.js) and [here](https://github.com/dtjohnson/bolus-examples/blob/master/express/app/server.js) in the Express example for a couple scenarios.) It can be injected like any other module:
```js
module.exports = function ($injector) {
    ...
};
```

*Warning: currently there is no check for circular dependencies when using resolve methods within a factory initialization. Be careful!*

## Development

### Running Tests
Tests are run automatically on [Travis CI](https://travis-ci.org/dtjohnson/bolus). They can (and should) be triggered locally with:
    
    $ npm test

### Code Linting
[JSHint](http://jshint.com/) and [JSCS](http://jscs.info/) are used to ensure code quality. To run these, run:
    
    $ npm run jshint
    $ npm run jscs

### Generating Documentation
The API reference documentation below is generated by [jsdoc-to-markdown](https://github.com/jsdoc2md/jsdoc-to-markdown). To generate an updated README.md, run:
    
    $ npm run docs

# API Reference
