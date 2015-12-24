"use strict";

var fs = require("fs");
var Injector = require("../lib/Injector");

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
            injector.registerPath("spec/samples/a.js");
            var a = require("./samples/a");
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).toThrow();
        });

        it("should add nodes with an array of files", function () {
            injector.registerPath(["spec/samples/a.js", "spec/samples/b.js"]);
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).not.toThrow();
        });

        it("should add nodes with a wildcard pattern", function () {
            injector.registerPath("spec/samples/*.js");
            expect(function () {
                injector.resolve("a");
            }).not.toThrow();
            expect(function () {
                injector.resolve("b");
            }).not.toThrow();
        });

        it("should add a single node with a wildcard pattern and negation", function () {
            injector.registerPath(["spec/samples/*.js", "!spec/samples/a.js"]);
            expect(function () {
                injector.resolve("a");
            }).toThrow();
            expect(function () {
                injector.resolve("b");
            }).not.toThrow();
        });

        it("should use a name maker to change the default name", function () {
            var nameMaker = jasmine.createSpy("nameMaker").and.callFake(function (defaultName, realpath, fn) {
                return defaultName.toUpperCase();
            });

            injector.registerPath("spec/samples/a.js", nameMaker);
            expect(function () {
                injector.resolve("a");
            }).toThrow();
            expect(function () {
                injector.resolve("A");
            }).not.toThrow();

            var realpath = fs.realpathSync("spec/samples/a.js");
            var fn = require("./samples/a.js");
            expect(nameMaker).toHaveBeenCalledWith("a", realpath, fn);
        });
    });

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
            injector.register("d", function (a, c) {
                return { a: a, c: c, me: "d" };
            });

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
            var a = injector.resolvePath("spec/samples/a.js");

            var aFn = require("./samples/a.js");

            // Need to use toEqual here since the require execution creates a new object.
            expect(a).toEqual(aFn());
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
    });
});
