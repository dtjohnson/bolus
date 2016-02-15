"use strict";

var fs = require("fs");
var Injector = require("../lib/Injector");
var semver = require("semver");

describe("Injector", function () {
    var injector;
    beforeEach(function () {
        injector = new Injector();
    });

    describe("constructor", function () {
        it("should register the injector as $injector", function () {
            var $injector = injector.resolve("$injector");
            expect($injector).toBe(injector);
        });
    });

    describe("register", function () {
        it("should register a module with the given name", function () {
            var value = { foo: "bar" };

            injector.register("foo", function () {
                return value;
            });
            expect(injector.resolve("foo")).toBe(value);
        });
    });

    describe("registerValue", function () {
        it("should register a value with the given name", function () {
            var value = { foo: "bar" };
            injector.registerValue("bar", value);
            expect(injector.resolve("bar")).toBe(value);
        });
    });

    describe("registerPath", function () {
        it("should add a node with a single file", function () {
            injector.registerPath("spec/samples/functions/a.js");
            var a = require("./samples/functions/a");
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).toThrow();
        });

        it("should add nodes with an array of files", function () {
            injector.registerPath(["spec/samples/functions/a.js", "spec/samples/functions/b.js"]);
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).not.toThrow();
        });

        it("should add nodes with a wildcard pattern", function () {
            injector.registerPath("spec/samples/functions/*.js");
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).not.toThrow();
        });

        it("should add a single node with a wildcard pattern and negation", function () {
            injector.registerPath(["spec/samples/functions/*.js", "!spec/samples/functions/b.js"]);
            expect(function () {
                injector.resolve("b");
            }).toThrow();
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
        });

        it("should use a name maker to change the default name", function () {
            var nameMaker = jasmine.createSpy("nameMaker").and.callFake(function (defaultName, realpath, fn) {
                return defaultName.toUpperCase();
            });

            injector.registerPath("spec/samples/functions/a.js", nameMaker);
            expect(function () {
                injector.resolve("a");
            }).toThrow();
            expect(function () {
                injector.resolve("A");
            }).not.toThrow();

            var realpath = fs.realpathSync("spec/samples/functions/a.js");
            var fn = require("./samples/functions/a.js");
            expect(nameMaker).toHaveBeenCalledWith("a", realpath, fn);
        });
    });

    // Classes are only available in v4+.
    if (semver.major(process.version) >= 4) {
        describe("registration with class", function () {
            it("should work like functions", function () {
                injector.registerPath("spec/samples/**/*.js");
                expect(function () {
                    var c = injector.resolve("c");
                    var a = injector.resolve("a");
                    expect(c._c).toBe("c");
                    expect(c._a).toBe(a);
                }).not.toThrow();
            });
        });
    }

    describe("registerRequires", function () {
        it("should add nodes with the given names and required modules", function () {
            injector.registerRequires({
                foo: "fs",
                bar: "path"
            });

            expect(injector.resolve("foo")).toBe(require("fs"));
            expect(injector.resolve("bar")).toBe(require("path"));
        });
    });

    describe("resolve", function () {
        it("should resolve with dependencies", function () {
            injector.register("a", function () {
                return { me: "a" };
            });
            injector.register("b", function (a) {
                return { a: a, me: "b" };
            });
            injector.register("c", function (b) {
                return { b: b, me: "c" };
            });

            var dResolver = function () {
                var a = arguments[0];
                var c = arguments[1];
                return { a: a, c: c, me: "d" };
            };
            dResolver.$inject = ['a', 'c'];
            injector.register("d", dResolver);

            var a = injector.resolve("a");
            var b = injector.resolve("b");
            var c = injector.resolve("c");
            var d = injector.resolve("d");

            expect(a.me).toBe("a");

            expect(b.me).toBe("b");
            expect(b.a).toBe(a);

            expect(c.me).toBe("c");
            expect(c.b).toBe(b);

            expect(d.me).toBe("d");
            expect(d.a).toBe(a);
            expect(d.c).toBe(c);
        });

        it("should call the resolve function only once", function () {
            var value = { foo: "bar" };

            var timesCalled = 0;
            injector.register("foo", function () {
                timesCalled++;
                return value;
            });

            expect(injector.resolve("foo")).toBe(value);
            expect(injector.resolve("foo")).toBe(value);
            expect(injector.resolve("foo")).toBe(value);
            expect(timesCalled).toBe(1);
        });

        it("should resolve a single name", function () {
            var value = { foo: "bar" };
            injector.registerValue("bar", value);
            expect(injector.resolve("bar")).toBe(value);
        });

        it("should resolve to undefined if an optional dependency doesn't exist", function () {
            expect(function () {
                expect(injector.resolve("bar?")).toBeUndefined();
            }).not.toThrow();
        });

        it("should resolve using optional dependency", function () {
            var bar = {};
            injector.registerValue("bar", bar);
            expect(function () {
                expect(injector.resolve("bar?")).toBe(bar);
            }).not.toThrow();
        });

        it("should resolve to undefined if an optional dependency doesn't exist using $inject syntax", function () {
            expect(function () {
                var resolver = function (bar) {
                    expect(bar).toBeUndefined();
                };
                resolver.$inject = ["bar?"];
                injector.resolve(resolver);
            }).not.toThrow();
        });

        it("should resolve to undefined if an optional dependency doesn't exist using comment syntax", function () {
            expect(function () {
                injector.resolve(function (/* optional */ bar) {
                    expect(bar).toBeUndefined();
                });
            }).not.toThrow();
        });

        it("should resolve an array of names", function () {
            var a = { a: "a" };
            var b = { a: "b" };
            injector.registerValue("a", a);
            injector.registerValue("b", b);
            expect(injector.resolve(["a", "b"])).toEqual([a, b]);
        });

        it("should resolve a function", function () {
            var a = { a: "a" };
            var b = { a: "b" };
            injector.registerValue("a", a);
            injector.registerValue("b", b);

            var resolvedA, resolvedB;
            var result = injector.resolve(function (a, _b_) {
                resolvedA = a;
                resolvedB = _b_;
                return [a, _b_];
            });

            expect(resolvedA).toBe(a);
            expect(resolvedB).toBe(b);
            expect(result).toEqual([a, b]);
        });

        it("should resolve a function using $inject syntax", function () {
            var a = { a: "a" };
            var b = { a: "b" };
            injector.registerValue("a", a);
            injector.registerValue("b", b);

            var resolvedA, resolvedB;
            var resolver = function () {
                resolvedA = arguments[0];
                resolvedB = arguments[1];
                return [resolvedA, resolvedB];
            };
            resolver.$inject = ['a', 'b'];
            var result = injector.resolve(resolver);

            expect(resolvedA).toBe(a);
            expect(resolvedB).toBe(b);
            expect(result).toEqual([a, b]);
        });

        it("should throw an error if a dependency doesn't exist", function () {
            expect(function () {
                injector.resolve("foo");
            }).toThrow();
        });

        it("should throw an error if a circular dependency exists", function () {
            injector.register("a", function (b) {});
            injector.register("b", function (a) {});
            expect(function () {
                injector.resolve("a");
            }).toThrowError(/circular/i);
        });
    });

    describe("resolvePath", function () {
        it("should resolve a file", function () {
            var a = injector.resolvePath("spec/samples/functions/a.js");

            var aFn = require("./samples/functions/a.js");

            // Need to use toEqual here since the require execution creates a new object.
            expect(a).toEqual(aFn());
        });
    });

    describe("isRegistered", function () {
        it("should return false for names that are not registered", function () {
            expect(injector.isRegistered("foo")).toBe(false);
        });

        it("should return true for names that are registered", function () {
            injector.registerValue("foo", {});
            expect(injector.isRegistered("foo")).toBe(true);
        });
    });

    describe("getRegisteredNames", function () {
        it("should return an array with just the injector if nothing is registered", function () {
            expect(injector.getRegisteredNames()).toEqual(['$injector']);
        });

        it("should return an array of names matching the registered values", function () {
            injector.registerValue("foo", {});
            injector.registerValue("bar", {});
            expect(injector.getRegisteredNames()).toEqual(['$injector', 'foo', 'bar']);
        });
    });

    describe("_getArguments", function () {
        it("should return an empty array for a function with no arguments", function () {
            var args = Injector._getArguments(function () {});
            expect(args).toEqual([]);
        });

        it("should return an array of arguments for a function with arguments", function () {
            var args = Injector._getArguments(function (a, b, c) {});
            expect(args).toEqual(['a', 'b', 'c']);
        });

        it("should return an array of arguments for a function with arguments and a name", function () {
            var args = Injector._getArguments(function foo(a, b, c) {});
            expect(args).toEqual(['a', 'b', 'c']);
        });

        it("should return an array of arguments for a function with arguments and comments", function () {
            var args = Injector._getArguments(function (a, /* foo */ b, c) {});
            expect(args).toEqual(['a', 'b', 'c']);
        });

        it("should return an array of arguments for a function with optional dependencies", function () {
            var args = Injector._getArguments(function (a, /* optional */ b, c) {});
            expect(args).toEqual(['a', 'b?', 'c']);
        });
    });

    describe("_getArgumentsFromString", function () {
        it("should parse a normal function", function () {
            var fn = "function (a, b) {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['a', 'b']);
        });

        it("should parse an arrow function with no arguments", function () {
            var fn = "() => {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual([]);
        });

        it("should parse an arrow function with one argument", function () {
            var fn = "foo => {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['foo']);
        });

        it("should parse an arrow function with multiple arguments", function () {
            var fn = "(foo, bar) => {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['foo', 'bar']);
        });

        it("should parse an arrow function that returns an arrow function", function () {
            var fn = "(foo, bar) => (baz) => {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['foo', 'bar']);
        });

        it("should parse a function with an arrow in the body", function () {
            var fn = "function (foo, bar) {\n// foo => bar  \n}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['foo', 'bar']);
        });

        it("should parse a function with new lines in the arguments", function () {
            var fn = "function (\na, \n b, /* comment */ c, \n, d) {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['a', 'b', 'c', 'd']);
        });

        it("should parse a function with optional dependency in the arguments", function () {
            var fn = "function (a, b, /* optional */ c, d) {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['a', 'b', 'c?', 'd']);
        });

        it("should parse a class with a constructor", function () {
            var fn = "class { constructor(a, b, c) {}; }";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['a', 'b', 'c']);
        });

        it("should parse a class with a function before the constructor", function () {
            var fn = "class { foo() {}; constructor(a, b, c) {}; }";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual(['a', 'b', 'c']);
        });

        it("should parse a class without a constructor", function () {
            var fn = "class {}";
            var args = Injector._getArgumentsFromString(fn);
            expect(args).toEqual([]);
        });
    });
});
