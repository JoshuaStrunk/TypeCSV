"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var parse = require("csv-parse/lib/sync");
(function () {
    var pathToData = path.join(process.cwd(), process.argv[2]);
    var pathToOutDir = path.join(process.cwd(), "out");
    if (process.argv.length > 3) {
        pathToOutDir = path.join(process.cwd(), process.argv[3]);
    }
    try {
        fs.mkdirSync(pathToOutDir);
    }
    catch (e) {
        if (e.code !== "EEXIST") {
            console.error(JSON.stringify(e));
            return;
        }
    }
    try {
        var test = fs.readdirSync(pathToData);
        console.log(JSON.stringify(test));
        for (var i = 0; i < test.length; i++) {
            var fileName = test[i];
            if (path.extname(fileName) === ".csv") {
                genTable(path.join(pathToData, fileName), pathToOutDir);
            }
        }
    }
    catch (e) {
        if (e.code === "ENOTDIR")
            genTable(pathToData, pathToOutDir);
        else
            console.error(e);
    }
}());
function genTable(filePath, outPath) {
    fs.readFile(filePath, 'utf8', function (err, data) {
        if (err != null) {
            switch (err.code) {
                case "ENOENT":
                    console.log("File " + process.argv[2] + " does not exist");
                    break;
                default:
                    console.log(JSON.stringify(err));
                    break;
            }
            return;
        }
        var parsedCSV = parse(data);
        var tableName = path.basename(filePath, '.csv');
        var headerRow = [];
        var primaryColumnIndex = 0;
        parsedCSV[0].forEach(function (value, index) {
            var splitHeaderValue = value.split(':');
            headerRow.push({
                propertyName: splitHeaderValue[0],
                propertyType: splitHeaderValue.length > 1 ? splitHeaderValue[1] : "Any",
                specialKey: splitHeaderValue.length > 2 ? splitHeaderValue[2] : null,
            });
            //Override default primary Column?
            if (headerRow[headerRow.length - 1].specialKey == "PrimaryKey") {
                primaryColumnIndex = index;
            }
        });
        var jsonified = {};
        for (var i = 1; i < parsedCSV.length; i++) {
            var entryRow = parsedCSV[i];
            var pk = entryRow[primaryColumnIndex];
            if (jsonified.hasOwnProperty(pk)) {
                console.error("Exited before completion: " + tableName + "'s PrimiaryKey(" + headerRow[primaryColumnIndex].propertyName + ") integrity is compromised duplicate key " + pk + " found on row " + (i + 1) + ".");
                return;
            }
            jsonified[pk] = {};
            for (var j = 0; j < headerRow.length; j++) {
                var headerEntry = headerRow[j];
                jsonified[pk][headerEntry.propertyName] = typeEntry(entryRow[j], headerEntry.propertyType);
            }
        }
        var csFile = "public class {0} {\n".replace("{0}", tableName);
        var tsFile = "interface {0} {\n".replace("{0}", tableName);
        for (var i = 0; i < headerRow.length; i++) {
            var type = headerRow[i].propertyType;
            var name_1 = headerRow[i].propertyName;
            csFile += "   " + cSharpProp.replace("{type}", toCSharpType(type)).replace("{name}", name_1);
            tsFile += "   " + typeScriptProp.replace("{type}", toTypeScriptType(type)).replace("{name}", name_1);
        }
        csFile += "}\n";
        tsFile += "}\n";
        fs.writeFile(path.join(outPath, tableName + ".cs"), csFile, function (err) { if (err !== null)
            console.error(JSON.stringify(err)); });
        fs.writeFile(path.join(outPath, tableName + ".d.ts"), tsFile, function (err) { if (err !== null)
            console.error(JSON.stringify(err)); });
        fs.writeFile(path.join(outPath, tableName + ".json"), JSON.stringify(jsonified, null, '\t'), function (err) { if (err !== null)
            console.error(JSON.stringify(err)); });
    });
}
function typeEntry(val, type) {
    return validTypes[type](val);
}
var validTypes = {
    "Any": function (val) { return val; },
    "String": function (val) { return val; },
    "Int": function (val) {
        var parsedInt = parseInt(val);
        if (parsedInt !== NaN && parsedInt === parseFloat(val)) {
            return parsedInt;
        }
        else {
            console.error("Attempt to convert " + val + " to int failed");
            return null;
        }
    },
    "Float": function (val) {
        var parsedFloat = parseFloat(val);
        if (parsedFloat !== NaN) {
            return parsedFloat;
        }
        else {
            console.error("Attempt to convert " + val + " to float failed");
            return null;
        }
    },
    "Int[]": function (val) { return parse(val)[0].map(function (innerVal) { return validTypes["Int"](innerVal); }); },
    "String[]": function (val) { return parse(val)[0].map(function (innerVal) { return validTypes["String"](innerVal); }); }
};
var cSharpProp = "public {type} {name};\n";
function toCSharpType(type) {
    switch (type) {
        case "Any":
        case "String":
            return "string";
        case "Int": return "int";
        case "Float": return "float";
        case "Int[]": return "int[]";
        case "String[]": return "string[]";
    }
}
var typeScriptProp = "{name} : {type},\n";
function toTypeScriptType(type) {
    switch (type) {
        case "Any":
        case "String":
            return "string";
        case "Int":
        case "Float":
            return "number";
        case "Int[]":
            return "number[]";
        case "String[]":
            return "string[]";
    }
}
