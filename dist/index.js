"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var path = require("path");
var fs = require("fs");
var parse = require("csv-parse/lib/sync");
var config = null;
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
        //Get out the config file
        var configFile = test.filter(function (value) { return value == "tcsvconfig.json"; });
        console.assert(configFile.length > 0, "No config file found");
        config = JSON.parse(fs.readFileSync(path.join(pathToData, configFile[0]), "utf8"));
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
        var generatedFiles = {};
        for (var genId in config.codeGenerators) {
            if (config.codeGenerators.hasOwnProperty(genId)) {
                generatedFiles[genId] = config.codeGenerators[genId].objectOpen.replace("{objectName}", tableName) + '\n';
            }
        }
        for (var i = 0; i < headerRow.length; i++) {
            var type = headerRow[i].propertyType;
            var name_1 = headerRow[i].propertyName;
            for (var genId in config.codeGenerators) {
                var codeGenerator = config.codeGenerators[genId];
                if (config.codeGenerators.hasOwnProperty(genId)) {
                    generatedFiles[genId] += '\t' + codeGenerator.objectProperty
                        .replace("{propertyType}", mapType(type, codeGenerator.typeMapping, codeGenerator.listType))
                        .replace("{propertyName}", name_1) + '\n';
                }
            }
        }
        for (var genId in config.codeGenerators) {
            if (config.codeGenerators.hasOwnProperty(genId)) {
                generatedFiles[genId] += config.codeGenerators[genId].objectClose + '\n';
                fs.writeFile(path.join(outPath, (tableName + "{ext}").replace("{ext}", config.codeGenerators[genId].ext)), generatedFiles[genId], function (err) { if (err !== null)
                    console.error(JSON.stringify(err)); });
            }
        }
    });
}
function mapType(type, typeMapping, listType) {
    var mappedType = "{propertyType}";
    var typeInfo = getBaseTypeAndListLevels(type);
    for (var i = 0; i < typeInfo.listLevels; i++) {
        mappedType = mappedType.replace("{propertyType}", listType);
    }
    return mappedType.replace("{propertyType}", typeMapping[typeInfo.baseType]);
}
function typeEntry(val, type) {
    var typeInfo = getBaseTypeAndListLevels(type);
    return typeValue(val, typeInfo.baseType, typeInfo.listLevels);
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
    }
};
function getBaseTypeAndListLevels(val) {
    var i = 0;
    for (; val.slice(val.length - 2) === "[]"; i++, val = val.slice(0, val.length - 2)) { }
    return {
        listLevels: i,
        baseType: val
    };
}
function typeValue(val, baseType, listLevels) {
    if (listLevels < 1)
        return validTypes[baseType](val);
    else
        return parse(val)[0].map(function (innerVal) { return typeValue(innerVal, baseType, listLevels - 1); });
}
