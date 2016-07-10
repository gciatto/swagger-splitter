/**
 * Created by gciatto on 10/07/16.
 */
var data = new Map();

module.exports = {
    put: put,

    get: get,
    
    toId: toId,

    navigate: {
        beadthFirst: navigateBeadthFirst
    },

    putObj: putObj
};

function toId(x) {
    if (Array.isArray(x)) {
        return pathToId(x, x[0] === "#" ? 1 : 0);
    } else {
        return pathToId(Array.from(arguments), arguments[0] === "#" ? 1 : 0);
    }
}

function pathToId(pathArray, begin) {
    var id = ["#"];
    for (var i = begin || 0; i < pathArray.length; i++) {
        id.push(pathArray[i]);
    }
    id.toString = function () {
        return id.map(function (x) {
            return "`" + x + "´";
        }).join("/");
    };
    return Object.freeze(id);
}

function navigateBeadthFirst(apiObj, f) {
    function navigate(x, path) {
        if (x !== null && (typeof x === 'object' || Array.isArray(x))) {
            for (var k in x) {
                var v = x[k];
                path.push(k);
                f(x, k, v, path);
                navigate(v, path);
                path.pop();
            }
        }
    }

    navigate(apiObj, [apiObj]);
}

function putObj(obj) {
    navigateBeadthFirst(obj, function (parent, k, v, stack) {
        put(parent, k, v, stack);
    });
}

function put(parent, key, value, path) {
    var id = pathToId(path, 1);
    data.set(id.toString(), {
        id: id,
        parent: parent,
        key: key,
        value: value
    });
    // try {
    //     Object.defineProperty(value, "$id$", {
    //         value: id
    //     });
    //     Object.defineProperty(value, "$parent$", {
    //         value: parent
    //     });
    // } catch (e) {
    //     console.info(e);
    // }
    return id;
}

function get(x) {
    return data.get(toId(Array.isArray(x) ? x : Array.from(arguments)).toString());
}