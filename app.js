var Fs = require("fs");
var Path = require("path");
var Sp = require("swagger-parser");
var Kb = require("./kb");

var Fields = ["parameters", "responses", "definitions", "securityDefinitions", "tags", "paths"];

try {
    main(process.argv);
    // scanRecursively("splitted/paths", function (x) {
    //     console.log(x);
    // });
} catch (e) {
    console.error(e);
}

function main(args) {
    var todo = checkArgs(args);
    var swaggerFilePath = process.argv[1];

    if (todo.split) {
        split(todo.split);
    } else if (todo.unify) {
        unify(todo.unify);
    }
}

function checkArgs(args) {
    var x = {};
    var input = findArg(args, ["--input", "-i"]);
    var inputFile = input >= 0 ? args[input + 1] : "swagger.yaml";
    var inputDir = input >= 0 ? args[input + 1] : "splitted";
    var output = findArg(args, ["--output", "-o"]);

    if (findArg(args, ["--split", "-s"]) >= 0) {
        x.split = {
            inputFile: inputFile,
            outputDir: output >= 0 ? args[output + 1] : Path.join(Path.dirname(inputFile), "splitted"),
            parameters: {
                value: findArg(args, ["--all", "--parameters", "-as", "--arguments"]) >= 0
            },
            responses: {
                value: findArg(args, ["--all", "--responses", "-rs"]) >= 0
            },
            definitions: {
                value: findArg(args, ["--all", "--definitions", "-ds"]) >= 0
            },
            paths: {
                value: findArg(args, ["--all", "--paths", "-ps"]) >= 0
            },
            tags: {
                value: findArg(args, ["--all", "--tags", "-ts"]) >= 0
            },
            securityDefinitions: {
                value: findArg(args, ["--all", "--securityDefinitions", "-sds"]) >= 0
            }
        };
    } else if (findArg(args, ["--unify", "-u"]) >= 0) {
        x.unify = {
            inputDir: inputDir,
            outputFile: output >= 0 ? args[output + 1] : Path.join(Path.dirname(inputFile), "swagger_unified.yaml")
        };
    } else {
        throw new Error("Invalid action: " + a);
    }

    return x;
}

function findArg(args, xs) {
    var res = -1;
    args.some(function (it, index) {
       if (xs.some(function (a) { return it === a; })) {
           res = index;
           return true;
       } else return false;
    });
    return res;
}

function split(ops, cb) {
    Sp.parse(ops.inputFile)
        .then(function (api) {
            Kb.putObj(api);

            mkdirIfMissingSync(ops.outputDir);

            if (ops.parameters.value) {
                splitParameters(api.parameters, ops.outputDir);
                delete api.parameters;
            }

            if (ops.responses.value) {
                splitField("responses", api.responses, ops.outputDir);
                delete api.responses;
            }

            if (ops.definitions.value) {
                splitField("definitions", api.definitions, ops.outputDir);
                delete api.definitions;
            }

            if (ops.securityDefinitions.value) {
                splitField("securityDefinitions", api.securityDefinitions, ops.outputDir);
                delete api.securityDefinitions;
            }

            if (ops.tags.value) {
                splitField("tags", api.tags, ops.outputDir);
                delete api.tags;
            }

            if (ops.paths.value) {
                splitPaths(api.paths, ops.outputDir);
                delete api.paths;
            }

            saveAsYamlSync(ops.outputDir, "swagger", api);
        });
}

function unify(opts) {
    var rootDir = opts.inputDir;

    var api = loadYamlSync(Path.join(rootDir, "swagger.yaml"));

    Fields.forEach(function (x) {
        if (dirExists(Path.join(rootDir, x)))
            unifyField(x, api, rootDir);
    });

    saveAsYamlSync(Path.dirname(opts.outputFile), Path.basename(opts.outputFile, ".yaml"), api);
}

function unifyField(fieldName, api, rootDir) {
    var fieldDir = Path.join(rootDir, fieldName);
    
    if (!dirExists(fieldDir)) return;
    
    var fieldObj = {};
    scanRecursively(fieldDir, function (f) {
        var yaml = loadYamlSync(f);

        for (var k in yaml) {
            fieldObj[k] = yaml[k];
        }
    });

    api[fieldName] = fieldObj;
}

function splitParameters(params, rootDir) {
    if (!params) return;

    var paramsDir = Path.join(rootDir, "parameters");

    mkdirIfMissingSync(paramsDir);

    var groupedByIn = groupBy(toListOfProperties(params), function (x) {
       return x.value.in;
    });

    var keys = groupedByIn.keys();
    var step;
    for (step = keys.next(); !step.done; step = keys.next()) {
        var k = step.value;
        var inDir = Path.join(paramsDir, k);

        mkdirIfMissingSync(inDir);

        var ps = groupedByIn.get(k);

        for (var i in ps) {
            var p = ps[i];
            var toSerialize = {};
            toSerialize[p.name] = p.value;

            saveAsYamlSync(inDir, p.name, toSerialize);
        }
    }

}

function splitField(fieldName, fieldObj, rootDir) {
    if (!fieldObj) return;

    var dir = Path.join(rootDir, fieldName);

    mkdirIfMissingSync(dir);

    for (var k in fieldObj) {
        var r = fieldObj[k];
        var toSerialize = {};

        toSerialize[k] = r;

        saveAsYamlSync(dir, k, toSerialize);
    }

}

function splitPaths(paths, rootDir) {
    if (!paths) return;

    for (var p in paths) {
        var dirname = Path.join(rootDir, "paths", Path.dirname(p));
        var basename = Path.basename(p);
        var filename = Path.join(dirname, basename);

        fromRootToBasename(dirname, function (x, info) {
            if (info.level > 1)
                mkdirIfMissingSync(x);
        });

        var toSerialize = {};
        toSerialize[p] = paths[p];

        saveAsYamlSync(dirname, basename, toSerialize);
    }
}

function toListOfProperties(x) {
    var r = [];
    for (var k in x) {
        r.push({
            name: k,
            value: x[k]
        })
    }
    return r;
}

function groupBy(xs, selector) {
    var r = new Map();
    for (var i in xs) {
        var x = xs[i];
        var k = selector(x, i, xs);

        var lst = r.get(k);

        if (lst === undefined) {
            lst = [];
            r.set(k, lst);
        }

        lst.push(x);
    }
    return r;
}

function mkdirIfMissingSync(path, mode) {
    if (!dirExists(path)) {
        try {
            Fs.mkdirSync(path, mode);
        } catch (e) {
            console.error(e);
        }
    }
}

function isDir(path) {
    try {
        return Fs.lstatSync(path).isDirectory();
    } catch (e) {
        console.error(e);
    }
}

function dirExists(path) {
    try {
        return Fs.existsSync(path) && isDir(path);
    } catch (e) {
        console.error(e);
    }
}

function saveAsYamlSync(dir, name, obj) {
    try {
        Fs.writeFileSync(Path.join(dir, name + ".yaml"), Sp.YAML.stringify(obj));
    } catch (e) {
        console.error(e);
    }
}

function loadYamlSync(path) {
    try {
        var str = Fs.readFileSync(path, { encoding: "utf8" });
        return Sp.YAML.parse(str);
    } catch (e) {
        console.error(e);
    }
}

function fromRootToBasename(p, f) {
    if (p === "." || p === "") {
        f(p, { root: true, relative: true, level: 0});
    } else if (p === "/") {
        f(p, { root: true, absolute: true, level: 0 });
    } else if (p === "~") {
        f(p, { root: true, home: true, relative:true, level: 0});
    } else {
        var level = 1 + fromRootToBasename(Path.dirname(p), f);
        f(p, { level: level });
        return level;
    }
    return 0;
}

function scanRecursively(root, onFile) {
    var lst = Fs.readdirSync(root);
    var subDirs = [];
    for (var i in lst) {
        var path = Path.join(root, lst[i]);
        if (isDir(path)) {
            subDirs.push(path);
        } else {
            onFile(path);
        }
    }
    for (i in subDirs) {
        path = subDirs[i];
        scanRecursively(path, onFile);
    }
}