"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var parse = require("csv-parse/lib/sync");
(function () {
    var pathToCSV = path.join(process.cwd(), process.argv[2]);
    fs.readFile(pathToCSV, 'utf8', function (err, data) {
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
        console.log(data);
        console.log(" --- ");
        console.log(JSON.stringify(parsedCSV, null, ' '));
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
        console.log(JSON.stringify(headerRow));
        var jsonified = {};
        for (var i = 1; i < parsedCSV.length; i++) {
            var entryRow = parsedCSV[i];
            var pk = entryRow[primaryColumnIndex];
            if (jsonified.hasOwnProperty(pk)) {
                throw new Error("PrimiaryKey integrity compromised duplicate key " + pk + " found.");
            }
            jsonified[pk] = {};
            for (var j = 0; j < headerRow.length; j++) {
                var headerEntry = headerRow[j];
                jsonified[pk][headerEntry.propertyName] = typeEntry(entryRow[j], headerEntry.propertyType);
            }
        }
        console.log(JSON.stringify(jsonified, null, '\t'));
        var csFile = "public class {0} {\n".replace("{0}", path.basename(pathToCSV, '.csv'));
        var tsFile = "interface {0} {\n".replace("{0}", path.basename(pathToCSV, '.csv'));
        for (var i = 0; i < headerRow.length; i++) {
            var type = headerRow[i].propertyType;
            var name_1 = headerRow[i].propertyName;
            csFile += "   " + cSharpProp.replace("{type}", toCSharpType(type)).replace("{name}", name_1);
            tsFile += "   " + typeScriptProp.replace("{type}", toTypeScriptType(type)).replace("{name}", name_1);
        }
        csFile += "}\n";
        tsFile += "}\n";
        console.log(csFile);
        console.log(tsFile);
    });
}());
function typeEntry(val, type) {
    return validTypes[type](val);
}
var validTypes = {
    "Any": function (val) { return val; },
    "String": function (val) { return val; },
    "Int": function (val) { return Number(val); },
    "Float": function (val) { return Number(val); },
    "Int[]": function (val) { return val.split(',').map(function (innerVal) { return validTypes["Int"](innerVal); }); },
    "String[]": function (val) { return val.split(',').map(function (innerVal) { return validTypes["String"](innerVal); }); },
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
